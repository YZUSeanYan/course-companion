from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ProviderEndpoint:
    name: str
    base_url: str
    model: str
    api_key: str
    supports_vision: bool = False


def provider_endpoints_from_env() -> list[ProviderEndpoint]:
    """Build the ordered failover chain without ever serializing credentials."""
    candidates = [
        ("deepseek", "DEEPSEEK_API_KEY", "https://api.deepseek.com", "deepseek-flash", False),
        ("kimi", "KIMI_API_KEY", "https://api.kimi.com/coding/v1", "k3.1-pro-highspeed", False),
        ("mimo", "MIMO_API_KEY", "https://token-plan-cn.xiaomimimo.com/v1", "mimo-v2.6-flash", False),
    ]
    endpoints: list[ProviderEndpoint] = []
    for name, key_name, base_url, model, vision in candidates:
        api_key = os.getenv(key_name)
        if api_key:
            endpoints.append(ProviderEndpoint(name, base_url, model, api_key, vision))
    return endpoints


def vision_endpoints_from_env() -> list[ProviderEndpoint]:
    endpoints: list[ProviderEndpoint] = []
    base = os.getenv("VISION_PROVIDER_BASE_URL")
    model = os.getenv("VISION_PROVIDER_MODEL")
    key = os.getenv("VISION_PROVIDER_API_KEY")
    if all((base, model, key)):
        endpoints.append(ProviderEndpoint("vision", base or "", model or "", key or "", True))
    # Reuse the already configured provider keys for image understanding. These
    # models were verified with a synthetic diagram before being enabled; a text
    # model must never be treated as vision-capable without an explicit capability.
    mimo_key = os.getenv("MIMO_API_KEY")
    if mimo_key:
        endpoints.append(
            ProviderEndpoint(
                "mimo-vision",
                "https://token-plan-cn.xiaomimimo.com/v1",
                os.getenv("VISION_MIMO_MODEL", "mimo-v2.6-pro"),
                mimo_key,
                True,
            )
        )
    deepseek_key = os.getenv("DEEPSEEK_API_KEY")
    if deepseek_key:
        endpoints.append(
            ProviderEndpoint(
                "deepseek-vision",
                "https://api.deepseek.com",
                os.getenv("VISION_DEEPSEEK_MODEL", "deepseek-flash"),
                deepseek_key,
                True,
            )
        )
    endpoints.extend(endpoint for endpoint in provider_endpoints_from_env() if endpoint.supports_vision)
    return endpoints
