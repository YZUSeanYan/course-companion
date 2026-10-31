from __future__ import annotations

import os
from dataclasses import dataclass
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .provider_catalog import provider_endpoints_from_env


def _int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name)
    try:
        value = default if raw is None else int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value


def _float_env(name: str, default: float, minimum: float, maximum: float) -> float:
    raw = os.getenv(name)
    try:
        value = default if raw is None else float(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be a number") from exc
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value


def _bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be a boolean")


@dataclass(frozen=True, slots=True)
class Settings:
    database_path: str
    token_pepper: str | None
    provider_base_url: str | None
    provider_model: str | None
    provider_api_key: str | None
    provider_timeout_seconds: float = 30.0
    provider_max_retries: int = 2
    provider_retry_backoff_seconds: float = 0.25
    device_daily_quota: int = 20
    register_rate_limit: int = 5
    register_rate_window_seconds: int = 3600
    analyze_rate_limit: int = 30
    analyze_rate_window_seconds: int = 60
    lecsync_daily_text_quota: int = 50000
    lecsync_daily_audio_seconds: float = 3600.0
    lecsync_rate_limit: int = 60
    lecsync_max_concurrent_streams: int = 3
    require_account_activation: bool = True
    usage_timezone: str = "Asia/Shanghai"
    account_encryption_key: str | None = None
    account_default_ai_pack_daily_limit: int = 5
    account_default_audio_minutes_daily_limit: int = 60
    account_default_text_chars_daily_limit: int = 20000
    account_default_document_daily_limit: int = 5
    account_default_max_devices: int = 3
    admin_password: str | None = None
    admin_session_secret: str | None = None
    admin_session_hours: int = 12
    admin_cookie_secure: bool = True
    admin_dist_dir: str | None = None

    @classmethod
    def from_env(cls) -> "Settings":
        endpoints = provider_endpoints_from_env()
        first = endpoints[0] if endpoints else None
        usage_timezone = os.getenv("USAGE_TIMEZONE", "Asia/Shanghai")
        try:
            ZoneInfo(usage_timezone)
        except ZoneInfoNotFoundError as exc:
            raise ValueError(f"USAGE_TIMEZONE is not a valid timezone: {usage_timezone}") from exc
        admin_password = os.getenv("ADMIN_PASSWORD") or None
        if admin_password is not None and len(admin_password) < 12:
            raise ValueError("ADMIN_PASSWORD must be at least 12 characters")
        return cls(
            database_path=os.getenv("DATABASE_PATH", "learning_analysis.db"),
            token_pepper=os.getenv("TOKEN_PEPPER") or None,
            provider_base_url=os.getenv("AI_PROVIDER_BASE_URL") or (first.base_url if first else None),
            provider_model=os.getenv("AI_PROVIDER_MODEL") or (first.model if first else None),
            provider_api_key=os.getenv("AI_PROVIDER_API_KEY") or (first.api_key if first else None),
            provider_timeout_seconds=_float_env(
                "AI_PROVIDER_TIMEOUT_SECONDS", 30.0, 0.1, 120.0
            ),
            provider_max_retries=_int_env("AI_PROVIDER_MAX_RETRIES", 2, 0, 3),
            provider_retry_backoff_seconds=_float_env(
                "AI_PROVIDER_RETRY_BACKOFF_SECONDS", 0.25, 0.0, 5.0
            ),
            device_daily_quota=_int_env("DEVICE_DAILY_QUOTA", 20, 1, 10000),
            register_rate_limit=_int_env("REGISTER_RATE_LIMIT", 5, 1, 10000),
            register_rate_window_seconds=_int_env(
                "REGISTER_RATE_WINDOW_SECONDS", 3600, 1, 86400
            ),
            analyze_rate_limit=_int_env("ANALYZE_RATE_LIMIT", 30, 1, 10000),
            analyze_rate_window_seconds=_int_env(
                "ANALYZE_RATE_WINDOW_SECONDS", 60, 1, 3600
            ),
            lecsync_daily_text_quota=_int_env("LECSYNC_DAILY_TEXT_QUOTA", 50000, 1, 10000000),
            lecsync_daily_audio_seconds=_float_env("LECSYNC_DAILY_AUDIO_SECONDS", 3600.0, 1.0, 86400.0),
            lecsync_rate_limit=_int_env("LECSYNC_RATE_LIMIT", 60, 1, 1000),
            lecsync_max_concurrent_streams=_int_env("LECSYNC_MAX_CONCURRENT_STREAMS", 3, 1, 100),
            require_account_activation=_bool_env("REQUIRE_ACCOUNT_ACTIVATION", True),
            usage_timezone=usage_timezone,
            account_encryption_key=os.getenv("ACCOUNT_ENCRYPTION_KEY") or None,
            account_default_ai_pack_daily_limit=_int_env(
                "ACCOUNT_DEFAULT_AI_PACK_DAILY_LIMIT", 5, 0, 10000
            ),
            account_default_audio_minutes_daily_limit=_int_env(
                "ACCOUNT_DEFAULT_AUDIO_MINUTES_DAILY_LIMIT", 60, 0, 100000
            ),
            account_default_text_chars_daily_limit=_int_env(
                "ACCOUNT_DEFAULT_TEXT_CHARS_DAILY_LIMIT", 20000, 0, 100000000
            ),
            account_default_document_daily_limit=_int_env(
                "ACCOUNT_DEFAULT_DOCUMENT_DAILY_LIMIT", 5, 0, 10000
            ),
            account_default_max_devices=_int_env(
                "ACCOUNT_DEFAULT_MAX_DEVICES", 3, 0, 100
            ),
            admin_password=admin_password,
            admin_session_secret=os.getenv("ADMIN_SESSION_SECRET") or None,
            admin_session_hours=_int_env("ADMIN_SESSION_HOURS", 12, 1, 168),
            admin_cookie_secure=_bool_env("ADMIN_COOKIE_SECURE", True),
            admin_dist_dir=os.getenv("ADMIN_DIST_DIR") or None,
        )

    @property
    def account_key(self) -> str | None:
        return self.account_encryption_key or self.token_pepper

    @property
    def admin_enabled(self) -> bool:
        return bool(
            self.admin_password
            and (self.admin_session_secret or self.token_pepper)
            and self.account_key
        )

    @property
    def admin_signing_secret(self) -> str | None:
        return self.admin_session_secret or self.token_pepper

    @property
    def provider_configured(self) -> bool:
        return all(
            (self.provider_base_url, self.provider_model, self.provider_api_key)
        )

    def require_provider(self) -> None:
        if self.provider_configured:
            return
        missing = [
            name
            for name, value in (
                ("AI_PROVIDER_BASE_URL", self.provider_base_url),
                ("AI_PROVIDER_MODEL", self.provider_model),
                ("AI_PROVIDER_API_KEY", self.provider_api_key),
            )
            if not value
        ]
        raise ProviderNotConfigured(
            "AI provider is not configured; missing " + ", ".join(missing)
        )


class ProviderNotConfigured(RuntimeError):
    pass
