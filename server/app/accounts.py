from __future__ import annotations

import re
from dataclasses import dataclass

from .config import Settings
from .db import (
    AccountDisabled,
    AccountExpired,
    AccountRequired,
    Database,
)
from .security import decrypt_account_phone

_CHINA_MOBILE = re.compile(r"^1[3-9]\d{9}$")


def normalize_phone(raw: str) -> str:
    value = re.sub(r"[\s\-()]", "", (raw or "").strip())
    if value.startswith("+86"):
        value = value[3:]
    elif value.startswith("0086"):
        value = value[4:]
    elif value.startswith("86") and len(value) == 13:
        value = value[2:]
    if not _CHINA_MOBILE.fullmatch(value):
        raise ValueError("请输入 11 位中国大陆手机号")
    return value


def mask_phone(phone: str) -> str:
    if len(phone) < 7:
        return "****"
    return phone[:3] + "****" + phone[-4:]


def account_state(account: dict | None, today: str) -> str:
    if account is None:
        return "none"
    if account.get("status") != "active":
        return "disabled"
    valid_until = account.get("valid_until")
    if valid_until and str(valid_until) < today:
        return "expired"
    return "active"


@dataclass(frozen=True)
class QuotaLimits:
    ai_packs: int
    audio_seconds: float
    text_characters: int
    documents: int
    max_devices: int


@dataclass(frozen=True)
class QuotaSubject:
    account_id: str | None
    limits: QuotaLimits


def _limits_from_account(account: dict) -> QuotaLimits:
    return QuotaLimits(
        ai_packs=int(account["ai_pack_daily_limit"]),
        audio_seconds=float(account["audio_minutes_daily_limit"]) * 60.0,
        text_characters=int(account["text_chars_daily_limit"]),
        documents=int(account["document_daily_limit"]),
        max_devices=int(account["max_devices"]),
    )


def default_limits(settings: Settings) -> QuotaLimits:
    return QuotaLimits(
        ai_packs=settings.device_daily_quota,
        audio_seconds=settings.lecsync_daily_audio_seconds,
        text_characters=settings.lecsync_daily_text_quota,
        documents=settings.account_default_document_daily_limit,
        max_devices=settings.account_default_max_devices,
    )


def resolve_quota_subject(db: Database, settings: Settings, device_id: str) -> QuotaSubject:
    """Return the account that owns this device, or the legacy defaults when allowed."""
    account = db.account_for_device(device_id)
    today = db.today()
    state = account_state(account, today)
    if state == "disabled":
        raise AccountDisabled()
    if state == "expired":
        raise AccountExpired(str(account["valid_until"]))
    if account is None:
        if settings.require_account_activation:
            raise AccountRequired()
        return QuotaSubject(None, default_limits(settings))
    return QuotaSubject(str(account["id"]), _limits_from_account(account))


def require_active_account(db: Database, settings: Settings, device_id: str) -> dict | None:
    account = db.account_for_device(device_id)
    today = db.today()
    state = account_state(account, today)
    if state == "disabled":
        raise AccountDisabled()
    if state == "expired":
        raise AccountExpired(str(account["valid_until"]))
    if account is None and settings.require_account_activation:
        raise AccountRequired()
    return account


def account_status_payload(db: Database, settings: Settings, device_id: str) -> dict:
    account = db.account_for_device(device_id)
    today = db.today()
    state = account_state(account, today)
    if account is None:
        limits = default_limits(settings)
        return {
            "activated": False,
            "required": settings.require_account_activation,
            "status": "none",
            "phoneMasked": "",
            "displayName": "",
            "validUntil": None,
            "limits": _limits_payload(limits),
            "usage": db.account_usage_today(None, today),
        }
    phone_masked = "****"
    key = settings.account_key
    if key:
        try:
            phone_masked = mask_phone(decrypt_account_phone(str(account["phone_ciphertext"]), key))
        except ValueError:
            phone_masked = "****"
    return {
        "activated": state == "active",
        "required": settings.require_account_activation,
        "status": state,
        "phoneMasked": phone_masked,
        "displayName": str(account["display_name"] or ""),
        "validUntil": account["valid_until"],
        "limits": _limits_payload(_limits_from_account(account)),
        "usage": db.account_usage_today(str(account["id"]), today),
    }


def _limits_payload(limits: QuotaLimits) -> dict:
    return {
        "aiPacksPerDay": limits.ai_packs,
        "audioMinutesPerDay": int(limits.audio_seconds // 60),
        "textCharactersPerDay": limits.text_characters,
        "documentsPerDay": limits.documents,
        "maxDevices": limits.max_devices,
    }
