from __future__ import annotations

import hmac
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field

from .accounts import account_state, mask_phone, normalize_phone
from .config import Settings
from .db import Database
from .rate_limit import SlidingWindowRateLimiter
from .security import (
    admin_session_value,
    decrypt_account_phone,
    encrypt_account_phone,
    phone_digest,
    verify_admin_session,
)

COOKIE_NAME = "zhixi_admin"


class AdminLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: str = Field(min_length=1, max_length=200)


class AccountWriteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phone: str | None = Field(default=None, max_length=32)
    displayName: str = Field(default="", max_length=80)
    note: str = Field(default="", max_length=500)
    status: Literal["active", "disabled"] = "active"
    validUntil: str | None = None
    aiPacksPerDay: int = Field(default=5, ge=0, le=10000)
    audioMinutesPerDay: int = Field(default=60, ge=0, le=100000)
    textCharactersPerDay: int = Field(default=20000, ge=0, le=100000000)
    documentsPerDay: int = Field(default=5, ge=0, le=10000)
    maxDevices: int = Field(default=3, ge=0, le=100)


class AccountBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phones: list[str] = Field(min_length=1, max_length=500)
    displayName: str = Field(default="", max_length=80)
    note: str = Field(default="", max_length=500)
    validUntil: str | None = None
    aiPacksPerDay: int = Field(default=5, ge=0, le=10000)
    audioMinutesPerDay: int = Field(default=60, ge=0, le=100000)
    textCharactersPerDay: int = Field(default=20000, ge=0, le=100000000)
    documentsPerDay: int = Field(default=5, ge=0, le=10000)
    maxDevices: int = Field(default=3, ge=0, le=100)


class AppConfigWriteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    announcementEnabled: bool = False
    announcementTitle: str = Field(default="", max_length=80)
    announcementBody: str = Field(default="", max_length=2000)
    taglines: list[str] = Field(default_factory=list, max_length=8)


def _validate_date(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="有效期格式应为 YYYY-MM-DD",
        ) from exc
    return value


def _decrypt_phone(row: dict, settings: Settings) -> str:
    key = settings.account_key
    if not key or not row.get("phone_ciphertext"):
        return ""
    try:
        return decrypt_account_phone(str(row["phone_ciphertext"]), key)
    except ValueError:
        return ""


def _account_payload(row: dict, settings: Settings, today: str) -> dict:
    phone = _decrypt_phone(row, settings)
    return {
        "id": row["id"],
        "phone": phone,
        "phoneMasked": mask_phone(phone) if phone else "****",
        "displayName": row["display_name"],
        "note": row["note"],
        "status": row["status"],
        "state": account_state(row, today),
        "validUntil": row["valid_until"],
        "limits": {
            "aiPacksPerDay": int(row["ai_pack_daily_limit"]),
            "audioMinutesPerDay": int(row["audio_minutes_daily_limit"]),
            "textCharactersPerDay": int(row["text_chars_daily_limit"]),
            "documentsPerDay": int(row["document_daily_limit"]),
            "maxDevices": int(row["max_devices"]),
        },
        "usageToday": {
            "date": today,
            "aiPacks": int(row.get("today_ai_packs", 0)),
            "audioMinutes": round(float(row.get("today_audio_seconds", 0.0)) / 60.0, 1),
            "textCharacters": int(row.get("today_text_characters", 0)),
            "documents": int(row.get("today_documents", 0)),
        },
        "deviceCount": int(row.get("device_count", 0)),
        "devices": [
            {
                "deviceId": device["device_id"],
                "activatedAt": device["activated_at"],
                "lastSeenAt": device.get("last_seen_at"),
            }
            for device in (row.get("devices") or [])
        ],
        "lastActiveAt": row.get("last_active_at"),
        "requests7d": int(row.get("requests_7d", 0)),
        "errors7d": int(row.get("errors_7d", 0)),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def register_admin_routes(app: FastAPI, settings: Settings) -> None:
    login_limiter = SlidingWindowRateLimiter(5, 300)
    database: Database = app.state.db

    def require_session(request: Request) -> int:
        if not settings.admin_enabled:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="管理后台尚未配置 ADMIN_PASSWORD",
            )
        expires = verify_admin_session(
            settings.admin_signing_secret or "",
            request.cookies.get(COOKIE_NAME),
        )
        if expires is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="请先登录管理后台",
            )
        return expires

    def require_csrf(request: Request) -> None:
        if request.headers.get("X-Requested-With") != "zhixi-admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="缺少管理后台请求标识",
            )

    def account_key_or_fail() -> str:
        key = settings.account_key
        if not key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="未配置 ACCOUNT_ENCRYPTION_KEY，无法管理手机号",
            )
        return key

    def create_account(payload: AccountWriteRequest) -> dict:
        key = account_key_or_fail()
        token_pepper = settings.token_pepper
        if not token_pepper:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="未配置 TOKEN_PEPPER，无法创建试用账号",
            )
        if not payload.phone:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="请填写手机号",
            )
        try:
            phone = normalize_phone(payload.phone)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
            ) from exc
        phone_hash = phone_digest(phone, token_pepper)
        if database.account_by_phone_hash(phone_hash) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="该手机号已存在",
            )
        try:
            return database.create_account(
                phone_hash=phone_hash,
                phone_ciphertext=encrypt_account_phone(phone, key),
                display_name=payload.displayName,
                note=payload.note,
                valid_until=_validate_date(payload.validUntil),
                ai_pack_daily_limit=payload.aiPacksPerDay,
                audio_minutes_daily_limit=payload.audioMinutesPerDay,
                text_chars_daily_limit=payload.textCharactersPerDay,
                document_daily_limit=payload.documentsPerDay,
                max_devices=payload.maxDevices,
            )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="该手机号已存在",
            ) from exc

    @app.post("/admin/api/login")
    def admin_login(payload: AdminLoginRequest, request: Request, response: Response) -> dict:
        if not settings.admin_enabled:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="管理后台尚未配置 ADMIN_PASSWORD",
            )
        client_host = request.client.host if request.client else "unknown"
        if not login_limiter.allow(client_host):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="登录尝试过于频繁，请稍后再试",
            )
        if not hmac.compare_digest(payload.password, settings.admin_password or ""):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="管理员密码不正确",
            )
        expires = int(datetime.now().timestamp()) + settings.admin_session_hours * 3600
        value = admin_session_value(settings.admin_signing_secret or "", expires)
        response.set_cookie(
            COOKIE_NAME,
            value,
            max_age=settings.admin_session_hours * 3600,
            httponly=True,
            secure=settings.admin_cookie_secure,
            samesite="strict",
            path="/admin",
        )
        return {"authenticated": True, "expiresAt": expires}

    @app.post("/admin/api/logout")
    def admin_logout(
        request: Request,
        response: Response,
        _: int = Depends(require_session),
    ) -> dict:
        require_csrf(request)
        response.delete_cookie(COOKIE_NAME, path="/admin")
        return {"authenticated": False}

    @app.get("/admin/api/session")
    def admin_session(request: Request) -> dict:
        if not settings.admin_enabled:
            return {"authenticated": False, "adminEnabled": False}
        expires = verify_admin_session(
            settings.admin_signing_secret or "",
            request.cookies.get(COOKIE_NAME),
        )
        return {
            "authenticated": expires is not None,
            "adminEnabled": True,
            "expiresAt": expires,
        }

    @app.get("/admin/api/overview")
    def admin_overview(
        request: Request,
        days: int = 7,
        _: int = Depends(require_session),
    ) -> dict:
        days = max(1, min(days, 90))
        overview = database.api_overview(days)
        database_path = settings.database_path
        try:
            database_bytes = (
                0
                if database_path == ":memory:"
                else Path(database_path).stat().st_size
            )
        except OSError:
            database_bytes = 0
        return {
            **overview,
            "generatedAt": datetime.now().isoformat(),
            "service": {
                "status": "ok",
                "providerConfigured": settings.provider_configured
                or bool(getattr(app.state, "lecsync", None) and app.state.lecsync.configured),
                "adminEnabled": settings.admin_enabled,
                "databaseSizeBytes": database_bytes,
            },
            "endpoints": database.api_endpoint_breakdown(days),
            "models": database.api_model_breakdown(days),
        }

    @app.get("/admin/api/accounts")
    def admin_accounts(
        request: Request,
        query: str = "",
        _: int = Depends(require_session),
    ) -> dict:
        today = database.today()
        rows = database.list_accounts()
        items = []
        for row in rows:
            item = _account_payload(row, settings, today)
            item["devices"] = database.account_devices(str(row["id"]))
            item["devices"] = [
                {
                    "deviceId": device["device_id"],
                    "activatedAt": device["activated_at"],
                    "lastSeenAt": device.get("last_seen_at"),
                }
                for device in item["devices"]
            ]
            items.append(item)
        needle = query.strip()
        if needle:
            items = [
                item
                for item in items
                if needle in item["phone"]
                or needle in item["phoneMasked"]
                or needle.lower() in item["displayName"].lower()
                or needle.lower() in item["note"].lower()
            ]
        return {"items": items, "total": len(items)}

    @app.post("/admin/api/accounts", status_code=status.HTTP_201_CREATED)
    def admin_create_account(
        payload: AccountWriteRequest,
        request: Request,
        _: int = Depends(require_session),
    ) -> dict:
        require_csrf(request)
        account = create_account(payload)
        return _account_payload(
            {**account, "device_count": 0, "today_ai_packs": 0,
             "today_audio_seconds": 0.0, "today_text_characters": 0, "today_documents": 0},
            settings,
            database.today(),
        )

    @app.post("/admin/api/accounts/batch", status_code=status.HTTP_201_CREATED)
    def admin_create_accounts_batch(
        payload: AccountBatchRequest,
        request: Request,
        _: int = Depends(require_session),
    ) -> dict:
        require_csrf(request)
        created = 0
        skipped = 0
        invalid: list[str] = []
        for raw_phone in payload.phones:
            single = AccountWriteRequest(
                phone=raw_phone,
                displayName=payload.displayName,
                note=payload.note,
                validUntil=payload.validUntil,
                aiPacksPerDay=payload.aiPacksPerDay,
                audioMinutesPerDay=payload.audioMinutesPerDay,
                textCharactersPerDay=payload.textCharactersPerDay,
                documentsPerDay=payload.documentsPerDay,
                maxDevices=payload.maxDevices,
            )
            try:
                create_account(single)
                created += 1
            except HTTPException as exc:
                if exc.status_code == status.HTTP_409_CONFLICT:
                    skipped += 1
                else:
                    invalid.append(raw_phone)
            except ValueError:
                invalid.append(raw_phone)
        return {"created": created, "skipped": skipped, "invalid": invalid}

    @app.patch("/admin/api/accounts/{account_id}")
    def admin_update_account(
        account_id: str,
        payload: AccountWriteRequest,
        request: Request,
        _: int = Depends(require_session),
    ) -> dict:
        require_csrf(request)
        existing = database.account_by_id(account_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="账号不存在")
        fields: dict = {
            "display_name": payload.displayName,
            "note": payload.note,
            "status": payload.status,
            "valid_until": _validate_date(payload.validUntil),
            "ai_pack_daily_limit": payload.aiPacksPerDay,
            "audio_minutes_daily_limit": payload.audioMinutesPerDay,
            "text_chars_daily_limit": payload.textCharactersPerDay,
            "document_daily_limit": payload.documentsPerDay,
            "max_devices": payload.maxDevices,
        }
        if payload.phone:
            key = account_key_or_fail()
            token_pepper = settings.token_pepper
            if not token_pepper:
                raise HTTPException(status_code=503, detail="未配置 TOKEN_PEPPER")
            try:
                phone = normalize_phone(payload.phone)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            phone_hash = phone_digest(phone, token_pepper)
            other = database.account_by_phone_hash(phone_hash)
            if other is not None and other["id"] != account_id:
                raise HTTPException(status_code=409, detail="该手机号已存在")
            fields["phone_hash"] = phone_hash
            fields["phone_ciphertext"] = encrypt_account_phone(phone, key)
        try:
            account = database.update_account(account_id, fields)
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=409, detail="该手机号已存在") from exc
        if account is None:
            raise HTTPException(status_code=404, detail="账号不存在")
        usage = database.account_usage_today(account_id, database.today())
        devices = database.account_devices(account_id)
        row = {
            **account,
            "device_count": len(devices),
            "devices": devices,
            "today_ai_packs": usage["aiPacks"],
            "today_audio_seconds": usage["audioMinutes"] * 60,
            "today_text_characters": usage["textCharacters"],
            "today_documents": usage["documents"],
        }
        return _account_payload(row, settings, database.today())

    @app.delete("/admin/api/accounts/{account_id}")
    def admin_delete_account(
        account_id: str,
        request: Request,
        _: int = Depends(require_session),
    ) -> dict:
        require_csrf(request)
        if not database.delete_account(account_id):
            raise HTTPException(status_code=404, detail="账号不存在")
        return {"deleted": True}

    @app.post("/admin/api/accounts/{account_id}/unbind")
    def admin_unbind_account(
        account_id: str,
        request: Request,
        _: int = Depends(require_session),
    ) -> dict:
        require_csrf(request)
        if database.account_by_id(account_id) is None:
            raise HTTPException(status_code=404, detail="账号不存在")
        return {"unbound": database.unbind_all_devices(account_id)}

    @app.get("/admin/api/devices")
    def admin_devices(
        request: Request,
        scope: Literal["unbound", "bound", "all"] = "unbound",
        limit: int = 200,
        _: int = Depends(require_session),
    ) -> dict:
        counts = database.device_counts()
        rows = database.list_devices(
            max(1, min(limit, 1000)),
            unbound_only=(scope == "unbound"),
        )
        items = []
        for row in rows:
            phone = _decrypt_phone(row, settings)
            items.append(
                {
                    "deviceId": row["id"],
                    "createdAt": row["created_at"],
                    "lastSeenAt": row["last_seen_at"],
                    "requestCount": int(row.get("request_count", 0)),
                    "accountId": row["account_id"],
                    "accountName": row.get("display_name") or "",
                    "phone": phone,
                    "phoneMasked": mask_phone(phone) if phone else "—",
                }
            )
        return {
            "items": items,
            "total": len(items),
            "unboundTotal": counts["unbound"],
            "boundTotal": counts["bound"],
        }

    @app.delete("/admin/api/devices/anonymous")
    def admin_delete_anonymous_devices(
        request: Request,
        olderThanDays: int = 0,
        _: int = Depends(require_session),
    ) -> dict:
        require_csrf(request)
        days = None if olderThanDays <= 0 else min(olderThanDays, 3650)
        return database.delete_unbound_devices(days)

    @app.delete("/admin/api/devices/{device_id}")
    def admin_delete_device(
        device_id: str,
        request: Request,
        _: int = Depends(require_session),
    ) -> dict:
        require_csrf(request)
        if database.account_for_device(device_id) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="该设备已绑定账号，请先在账号下解绑",
            )
        if not database.delete_unbound_device(device_id):
            raise HTTPException(status_code=404, detail="设备不存在")
        return {"deleted": True}

    @app.delete("/admin/api/accounts/{account_id}/devices/{device_id}")
    def admin_unbind_device(
        account_id: str,
        device_id: str,
        request: Request,
        _: int = Depends(require_session),
    ) -> dict:
        require_csrf(request)
        if database.account_by_id(account_id) is None:
            raise HTTPException(status_code=404, detail="账号不存在")
        if not database.unbind_device(account_id, device_id):
            raise HTTPException(status_code=404, detail="该账号未绑定此设备")
        return {"unbound": True}

    @app.delete("/admin/api/requests")
    def admin_purge_requests(
        request: Request,
        olderThanDays: int = 0,
        _: int = Depends(require_session),
    ) -> dict:
        require_csrf(request)
        days = None if olderThanDays <= 0 else min(olderThanDays, 3650)
        return {"deleted": database.purge_api_requests(days)}

    @app.post("/admin/api/maintenance/cleanup")
    def admin_cleanup_legacy_data(
        request: Request,
        _: int = Depends(require_session),
    ) -> dict:
        """一次性清理历史测试数据：匿名设备、调用记录、过期验证码、孤儿同步记录。"""
        require_csrf(request)
        devices = database.delete_unbound_devices()
        requests_deleted = database.purge_api_requests()
        codes = database.purge_expired_codes(0)
        orphans = database.purge_orphan_sync_records()
        return {
            "anonymousDevices": devices,
            "apiRequests": requests_deleted,
            "smsCodes": codes["smsCodes"],
            "activationCodes": codes["activationCodes"],
            "orphanSyncRecords": orphans,
        }

    @app.get("/admin/api/requests")
    def admin_requests(
        request: Request,
        limit: int = 200,
        errorsOnly: bool = False,
        accountId: str | None = None,
        includeUnbound: bool = False,
        includePolling: bool = False,
        _: int = Depends(require_session),
    ) -> dict:
        rows = database.recent_api_requests(
            max(1, min(limit, 1000)),
            errorsOnly,
            account_id=accountId,
            include_unbound=includeUnbound,
            include_polling=includePolling,
        )
        items = []
        for row in rows:
            phone = _decrypt_phone(row, settings)
            items.append(
                {
                    "id": row["id"],
                    "deviceId": row["device_id"],
                    "accountId": row["account_id"],
                    "accountName": row.get("display_name") or "",
                    "phone": phone,
                    "phoneMasked": mask_phone(phone) if phone else "—",
                    "method": row["method"],
                    "route": row["route"],
                    "status": row["status"],
                    "durationMs": row["duration_ms"],
                    "createdAt": row["created_at"],
                }
            )
        return {"items": items, "total": len(items)}

    @app.get("/admin/api/health")
    def admin_health(_: int = Depends(require_session)) -> dict:
        return {
            "status": "ok",
            "providerConfigured": settings.provider_configured
            or bool(getattr(app.state, "lecsync", None) and app.state.lecsync.configured),
            "adminEnabled": settings.admin_enabled,
        }

    def _admin_app_config_payload() -> dict:
        document = database.get_app_config() or {}
        announcement = document.get("announcement")
        if not isinstance(announcement, dict):
            announcement = {}
        taglines = document.get("taglines")
        if not isinstance(taglines, list):
            taglines = []
        return {
            "announcementEnabled": bool(announcement.get("enabled", False)),
            "announcementTitle": str(announcement.get("title", "")),
            "announcementBody": str(announcement.get("body", "")),
            "taglines": [str(item) for item in taglines],
            "updatedAt": document.get("updated_at"),
        }

    @app.get("/admin/api/app-config")
    def admin_get_app_config(_: int = Depends(require_session)) -> dict:
        return _admin_app_config_payload()

    @app.patch("/admin/api/app-config")
    def admin_update_app_config(
        payload: AppConfigWriteRequest,
        request: Request,
        _: int = Depends(require_session),
    ) -> dict:
        require_csrf(request)
        taglines: list[str] = []
        for raw in payload.taglines:
            item = str(raw).strip()
            if not item:
                continue
            if len(item) > 40:
                raise HTTPException(status_code=422, detail="标语每条不超过 40 字")
            taglines.append(item)
        if len(taglines) > 8:
            raise HTTPException(status_code=422, detail="标语最多 8 条")
        title = payload.announcementTitle.strip()
        body = payload.announcementBody.strip()
        enabled = bool(payload.announcementEnabled) and bool(title or body)
        database.set_app_config(
            {
                "announcement": {"enabled": enabled, "title": title, "body": body},
                "taglines": taglines,
            }
        )
        return _admin_app_config_payload()
