from __future__ import annotations

import calendar
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Request, status

from .accounts import mask_phone, normalize_phone
from .auth import optional_device_identity
from .config import Settings
from .db import AccountError, Database
from .rate_limit import SlidingWindowRateLimiter
from .security import (
    encrypt_account_phone,
    phone_digest,
    request_ip_digest,
    sms_code_digest,
)
from .sms import AliyunSmsSender, SmsDeliveryError
from .trial_schemas import (
    TrialApplicationResponse,
    TrialApplyRequest,
    TrialCodeRequest,
    TrialCodeResponse,
    TrialLimitsResponse,
    TrialStatusResponse,
)


def _add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _trial_error(
    status_code: int,
    code: str,
    message: str,
    *,
    retry_after: int | None = None,
) -> HTTPException:
    headers = {"X-Zhixi-Error-Code": code}
    if retry_after is not None:
        headers["Retry-After"] = str(retry_after)
    return HTTPException(status_code=status_code, detail=message, headers=headers)


def register_trial_routes(app: FastAPI, settings: Settings) -> None:
    database: Database = app.state.db
    app.state.sms_sender = AliyunSmsSender(settings) if settings.sms_configured else None
    phone_limiter = SlidingWindowRateLimiter(settings.trial_code_per_phone_hour, 3600)
    ip_code_limiter = SlidingWindowRateLimiter(settings.trial_code_per_ip_hour, 3600)
    ip_apply_limiter = SlidingWindowRateLimiter(settings.trial_apply_per_ip_hour, 3600)

    def client_ip(request: Request) -> str:
        return (
            request.headers.get("x-real-ip")
            or (request.client.host if request.client else "unknown")
        )

    def normalize_or_error(raw: str) -> str:
        try:
            return normalize_phone(raw)
        except ValueError as exc:
            raise _trial_error(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid_phone", str(exc)
            ) from exc

    def require_pepper() -> str:
        if not settings.token_pepper:
            raise _trial_error(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "trial_unavailable",
                "试用申请服务尚未配置",
            )
        return settings.token_pepper

    @app.get("/v1/trial/status", response_model=TrialStatusResponse)
    def trial_status() -> TrialStatusResponse:
        return TrialStatusResponse(
            smsConfigured=app.state.sms_sender is not None,
            defaults=TrialLimitsResponse(
                aiPacksPerDay=settings.trial_default_ai_packs,
                audioMinutesPerDay=settings.trial_default_audio_minutes,
                textCharactersPerDay=settings.account_default_text_chars_daily_limit,
                documentsPerDay=settings.account_default_document_daily_limit,
                maxDevices=settings.account_default_max_devices,
            ),
        )

    @app.post("/v1/trial/request-code", response_model=TrialCodeResponse)
    async def request_code(payload: TrialCodeRequest, request: Request) -> TrialCodeResponse:
        pepper = require_pepper()
        phone = normalize_or_error(payload.phone)
        phone_hash = phone_digest(phone, pepper)
        if database.account_by_phone_hash(phone_hash) is not None:
            raise _trial_error(
                status.HTTP_409_CONFLICT,
                "phone_registered",
                "该手机号已在试用名单中，直接获取激活验证码即可使用",
            )
        ip_key = request_ip_digest(client_ip(request), pepper)
        if not phone_limiter.allow(phone_hash) or not ip_code_limiter.allow(ip_key):
            raise _trial_error(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "rate_limited",
                "验证码请求过于频繁，请稍后再试",
                retry_after=settings.trial_code_resend_seconds,
            )
        last_created = database.last_sms_code_created_at(phone_hash)
        if last_created:
            elapsed = (
                datetime.now(timezone.utc) - datetime.fromisoformat(last_created)
            ).total_seconds()
            if elapsed < settings.trial_code_resend_seconds:
                retry_after = max(1, int(settings.trial_code_resend_seconds - elapsed))
                raise _trial_error(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    "cooldown",
                    f"请 {retry_after} 秒后再获取验证码",
                    retry_after=retry_after,
                )
        sender = app.state.sms_sender
        if sender is None:
            raise _trial_error(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "sms_not_configured",
                "短信服务尚未配置，请联系管理员添加手机号",
            )
        code = f"{secrets.randbelow(900_000) + 100_000:06d}"
        expires_at = (
            datetime.now(timezone.utc) + timedelta(seconds=settings.trial_code_ttl_seconds)
        ).isoformat()
        code_id = database.create_sms_code(
            phone_hash,
            sms_code_digest(phone, code, pepper),
            expires_at,
            ip_key,
        )
        try:
            await sender.send_code(phone, code)
        except SmsDeliveryError as exc:
            database.invalidate_sms_code(code_id)
            raise _trial_error(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "sms_delivery_failed",
                "短信发送失败，请稍后重试或联系管理员",
            ) from exc
        except Exception as exc:
            database.invalidate_sms_code(code_id)
            raise _trial_error(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "sms_delivery_failed",
                "短信发送失败，请稍后重试或联系管理员",
            ) from exc
        return TrialCodeResponse(
            sent=True,
            expiresInSeconds=settings.trial_code_ttl_seconds,
            resendAfterSeconds=settings.trial_code_resend_seconds,
            phoneMasked=mask_phone(phone),
        )

    @app.post(
        "/v1/trial/apply",
        response_model=TrialApplicationResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def apply_for_trial(
        payload: TrialApplyRequest,
        request: Request,
        device_id: str | None = Depends(optional_device_identity),
    ) -> TrialApplicationResponse:
        pepper = require_pepper()
        if not payload.consent:
            raise _trial_error(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "consent_required",
                "请先阅读并同意隐私政策与试用规则",
            )
        phone = normalize_or_error(payload.phone)
        ip_key = request_ip_digest(client_ip(request), pepper)
        if not ip_apply_limiter.allow(ip_key):
            raise _trial_error(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "rate_limited",
                "申请过于频繁，请稍后再试",
                retry_after=60,
            )
        phone_hash = phone_digest(phone, pepper)
        code_status, code_row = database.check_sms_code(
            phone_hash,
            sms_code_digest(phone, payload.code, pepper),
            settings.trial_code_max_attempts,
        )
        if code_status == "not_found" or code_status == "consumed":
            raise _trial_error(
                status.HTTP_400_BAD_REQUEST,
                "invalid_code",
                "验证码已失效，请重新获取",
            )
        if code_status == "expired":
            raise _trial_error(
                status.HTTP_400_BAD_REQUEST,
                "code_expired",
                "验证码已过期，请重新获取",
            )
        if code_status == "attempts_exhausted":
            raise _trial_error(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "too_many_attempts",
                "验证码错误次数过多，请重新获取",
                retry_after=60,
            )
        if code_status == "mismatch":
            used = int(code_row["attempts"]) + 1 if code_row else 1
            remaining = max(0, settings.trial_code_max_attempts - used)
            raise _trial_error(
                status.HTTP_400_BAD_REQUEST,
                "wrong_code",
                f"验证码不正确，还可尝试 {remaining} 次",
            )
        if database.account_by_phone_hash(phone_hash) is not None:
            raise _trial_error(
                status.HTTP_409_CONFLICT,
                "phone_registered",
                "该手机号已在试用名单中，直接获取激活验证码即可使用",
            )
        account_key = settings.account_key
        if not account_key:
            raise _trial_error(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "trial_unavailable",
                "试用申请服务尚未配置",
            )
        valid_until = _add_months(
            date.fromisoformat(database.today()), settings.trial_default_valid_months
        ).isoformat()
        try:
            account = database.create_account(
                phone_hash=phone_hash,
                phone_ciphertext=encrypt_account_phone(phone, account_key),
                display_name=payload.nickname,
                note=f"官网自助申请 · 姓名：{payload.name}",
                valid_until=valid_until,
                ai_pack_daily_limit=settings.trial_default_ai_packs,
                audio_minutes_daily_limit=settings.trial_default_audio_minutes,
                text_chars_daily_limit=settings.account_default_text_chars_daily_limit,
                document_daily_limit=settings.account_default_document_daily_limit,
                max_devices=settings.account_default_max_devices,
            )
        except Exception as exc:
            if database.account_by_phone_hash(phone_hash) is not None:
                raise _trial_error(
                    status.HTTP_409_CONFLICT,
                    "phone_registered",
                    "该手机号已在试用名单中，直接获取激活验证码即可使用",
                ) from exc
            raise
        database.record_trial_application(
            str(uuid.uuid4()), str(account["id"]), phone_hash, ip_key
        )
        # 浏览器自助申请：短信已验证手机号，直接把当前设备绑定到新账号，
        # 让网页版（含 iOS/Safari）一次短信就完成「申请 + 激活」，无需再装 App。
        device_bound = False
        if device_id:
            try:
                database.bind_device(
                    str(account["id"]), device_id, int(account["max_devices"])
                )
                device_bound = True
            except AccountError:
                # 设备已绑定其他账号或达到上限：申请仍然成功，客户端可走常规激活流程。
                device_bound = False
        return TrialApplicationResponse(
            applied=True,
            phoneMasked=mask_phone(phone),
            validUntil=valid_until,
            message="申请成功，已开通试用额度" if device_bound else "申请成功，已加入试用名单",
            deviceBound=device_bound,
        )
