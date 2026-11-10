from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Request, status

from .accounts import account_state, mask_phone, normalize_phone
from .account_schemas import ActivationCodeRequest, ActivationCodeResponse
from .auth import device_identity
from .config import Settings
from .db import AccountDisabled, AccountExpired, Database
from .rate_limit import SlidingWindowRateLimiter
from .security import activation_code_digest, phone_digest, request_ip_digest
from .sms import SmsDeliveryError


def _activation_error(
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


def verify_activation_code(
    database: Database, settings: Settings, phone: str, code: str
) -> None:
    """Check an activation code for `phone`, consuming it on success.

    Raises HTTPException on failure; the code is consumed only when the
    digest matches and the code is still valid within the attempt budget.
    """
    pepper = settings.token_pepper
    if not pepper:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Account activation is unavailable: TOKEN_PEPPER is not configured",
        )
    code_status, code_row = database.check_activation_code(
        phone_digest(phone, pepper),
        activation_code_digest(phone, code, pepper),
        settings.activation_code_max_attempts,
    )
    if code_status == "not_found" or code_status == "consumed":
        raise _activation_error(
            status.HTTP_400_BAD_REQUEST,
            "invalid_code",
            "验证码已失效，请重新获取",
        )
    if code_status == "expired":
        raise _activation_error(
            status.HTTP_400_BAD_REQUEST,
            "code_expired",
            "验证码已过期，请重新获取",
        )
    if code_status == "attempts_exhausted":
        raise _activation_error(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "too_many_attempts",
            "验证码错误次数过多，请重新获取",
            retry_after=settings.activation_code_resend_seconds,
        )
    if code_status == "mismatch":
        used = int(code_row["attempts"]) + 1 if code_row else 1
        remaining = max(0, settings.activation_code_max_attempts - used)
        raise _activation_error(
            status.HTTP_400_BAD_REQUEST,
            "wrong_code",
            f"验证码不正确，还可尝试 {remaining} 次",
        )


def register_activation_routes(app: FastAPI, settings: Settings) -> None:
    database: Database = app.state.db
    phone_limiter = SlidingWindowRateLimiter(settings.activation_code_per_phone_hour, 3600)
    device_limiter = SlidingWindowRateLimiter(settings.activation_code_per_device_hour, 3600)
    ip_limiter = SlidingWindowRateLimiter(settings.activation_code_per_ip_hour, 3600)

    def client_ip(request: Request) -> str:
        # Never trust a client-supplied X-Real-IP header for rate limiting.
        # Only honor it when the immediate peer is a loopback reverse proxy.
        peer = request.client.host if request.client else "unknown"
        forwarded = (request.headers.get("x-real-ip") or "").strip()
        if forwarded and peer in {"127.0.0.1", "::1"}:
            return forwarded.split(",")[0].strip() or peer
        return peer

    def normalize_or_error(raw: str) -> str:
        try:
            return normalize_phone(raw)
        except ValueError as exc:
            raise _activation_error(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid_phone", str(exc)
            ) from exc

    @app.post(
        "/v1/accounts/activate/request-code",
        response_model=ActivationCodeResponse,
    )
    async def activate_request_code(
        payload: ActivationCodeRequest,
        request: Request,
        device_id: str = Depends(device_identity),
    ) -> ActivationCodeResponse:
        phone = normalize_or_error(payload.phone)
        pepper = settings.token_pepper or ""
        phone_hash = phone_digest(phone, pepper)
        account = database.account_by_phone_hash(phone_hash)
        if account is None:
            raise _activation_error(
                status.HTTP_404_NOT_FOUND,
                "account_not_found",
                "该手机号还没有试用额度，可自助申请试用或联系管理员添加",
            )
        state = account_state(account, database.today())
        if state == "disabled":
            raise AccountDisabled()
        if state == "expired":
            raise AccountExpired(str(account["valid_until"]))
        ip_key = request_ip_digest(client_ip(request), pepper)
        if (
            not phone_limiter.allow(phone_hash)
            or not device_limiter.allow(device_id)
            or not ip_limiter.allow(ip_key)
        ):
            raise _activation_error(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "rate_limited",
                "验证码请求过于频繁，请稍后再试",
                retry_after=settings.activation_code_resend_seconds,
            )
        last_created = database.last_activation_code_created_at(phone_hash)
        if last_created:
            elapsed = (
                datetime.now(timezone.utc) - datetime.fromisoformat(last_created)
            ).total_seconds()
            if elapsed < settings.activation_code_resend_seconds:
                retry_after = max(1, int(settings.activation_code_resend_seconds - elapsed))
                raise _activation_error(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    "cooldown",
                    f"请 {retry_after} 秒后再获取验证码",
                    retry_after=retry_after,
                )
        sender = app.state.sms_sender
        if sender is None:
            raise _activation_error(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "sms_not_configured",
                "短信服务尚未配置，请联系管理员",
            )
        code = f"{secrets.randbelow(900_000) + 100_000:06d}"
        expires_at = (
            datetime.now(timezone.utc)
            + timedelta(seconds=settings.activation_code_ttl_seconds)
        ).isoformat()
        code_id = database.create_activation_code(
            phone_hash,
            activation_code_digest(phone, code, pepper),
            expires_at,
            ip_key,
            device_id,
        )
        try:
            await sender.send_code(phone, code)
        except SmsDeliveryError as exc:
            database.invalidate_activation_code(code_id)
            raise _activation_error(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "sms_delivery_failed",
                "短信发送失败，请稍后重试或联系管理员",
            ) from exc
        except Exception as exc:
            database.invalidate_activation_code(code_id)
            raise _activation_error(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "sms_delivery_failed",
                "短信发送失败，请稍后重试或联系管理员",
            ) from exc
        return ActivationCodeResponse(
            sent=True,
            phoneMasked=mask_phone(phone),
            cooldownSeconds=settings.activation_code_resend_seconds,
        )
