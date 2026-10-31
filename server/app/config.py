from __future__ import annotations

import os
from dataclasses import dataclass

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

    @classmethod
    def from_env(cls) -> "Settings":
        endpoints = provider_endpoints_from_env()
        first = endpoints[0] if endpoints else None
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
        )

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
