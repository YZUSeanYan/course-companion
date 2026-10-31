from __future__ import annotations

import asyncio
import ipaddress
import json
import socket
from urllib.parse import urlsplit

import httpx
from pydantic import ValidationError

from .config import Settings
from .provider_catalog import ProviderEndpoint, provider_endpoints_from_env
from .schemas import AnalyzeRequest, LearningPackage

PROMPT_VERSION = "learning-pack-v1"
SCHEMA_VERSION = "1.0"


class ProviderError(RuntimeError):
    pass


class ProviderConfigurationError(ProviderError):
    pass


class ProviderUnavailable(ProviderError):
    pass


class ProviderInvalidResponse(ProviderError):
    pass


def validate_provider_url(base_url: str) -> str:
    try:
        parsed = urlsplit(base_url)
        port = parsed.port
    except ValueError as exc:
        raise ProviderConfigurationError("AI provider base URL is invalid") from exc
    if parsed.scheme not in {"http", "https"}:
        raise ProviderConfigurationError("AI provider URL must use http or https")
    if not parsed.hostname or parsed.username or parsed.password:
        raise ProviderConfigurationError("AI provider URL must have a host and no credentials")
    if parsed.query or parsed.fragment:
        raise ProviderConfigurationError("AI provider base URL cannot contain query or fragment")
    hostname = parsed.hostname.rstrip(".").lower()
    if hostname == "localhost" or hostname.endswith(".localhost") or "%" in hostname:
        raise ProviderConfigurationError("AI provider host is not allowed")
    port = port or (443 if parsed.scheme == "https" else 80)
    try:
        addresses = socket.getaddrinfo(
            hostname, port, type=socket.SOCK_STREAM, proto=socket.IPPROTO_TCP
        )
    except socket.gaierror as exc:
        raise ProviderConfigurationError("AI provider host could not be resolved") from exc
    if not addresses:
        raise ProviderConfigurationError("AI provider host did not resolve to an address")
    for address_info in addresses:
        raw_address = address_info[4][0]
        try:
            address = ipaddress.ip_address(raw_address)
        except ValueError as exc:
            raise ProviderConfigurationError("AI provider resolved address is invalid") from exc
        if (
            address.is_loopback
            or address.is_private
            or address.is_reserved
            or address.is_link_local
            or address.is_multicast
            or address.is_unspecified
            or not address.is_global
        ):
            raise ProviderConfigurationError(
                "AI provider URL resolves to a forbidden address"
            )
    return base_url.rstrip("/") + "/chat/completions"


class AIProvider:
    def __init__(
        self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        if not settings.provider_configured:
            raise ProviderConfigurationError("AI provider settings are incomplete")
        self.base_url = settings.provider_base_url or ""
        self.model = settings.provider_model or ""
        self.api_key = settings.provider_api_key or ""
        self.timeout = settings.provider_timeout_seconds
        self.max_retries = settings.provider_max_retries
        self.retry_backoff = settings.provider_retry_backoff_seconds
        self.transport = transport
        self.model_used = self.model
        configured = provider_endpoints_from_env()
        self.endpoints = configured or [
            ProviderEndpoint("default", self.base_url, self.model, self.api_key)
        ]

    async def generate_package(self, request: AnalyzeRequest) -> LearningPackage:
        messages = self._initial_messages(request)
        repair_error: str | None = None
        for attempt in range(2):
            if repair_error is not None:
                messages = [
                    *messages,
                    {"role": "assistant", "content": previous_content},
                    {
                        "role": "user",
                        "content": (
                            "The previous response was invalid. Return the complete corrected "
                            "JSON object only, without markdown. Validation error: "
                            + repair_error
                        ),
                    },
                ]
            previous_content = await self._request_chat(messages)
            try:
                return self._decode_package(previous_content, request)
            except (json.JSONDecodeError, ValidationError, ValueError) as exc:
                repair_error = str(exc)[:4000]
                if attempt == 1:
                    raise ProviderInvalidResponse(
                        "AI provider returned invalid JSON or schema after one repair"
                    ) from exc
        raise ProviderInvalidResponse("AI provider response could not be validated")

    def _initial_messages(self, request: AnalyzeRequest) -> list[dict[str, str]]:
        input_data = request.model_dump(by_alias=True, exclude_none=True)
        instructions = {
            "task": (
                "Create a bilingual Chinese-English learning pack grounded only in the "
                "provided chunks. Every item must cite existing sourceIds. Populate only "
                "requestedOutputs; all other output arrays must be empty. Vocabulary and "
                "phrases require Chinese and English definitions and an example. Quiz cards "
                "require front and back. Return JSON only, with no markdown."
            ),
            "input": input_data,
            "outputSchema": LearningPackage.model_json_schema(),
        }
        return [
            {
                "role": "system",
                "content": "You are a precise learning assistant that returns valid JSON only.",
            },
            {
                "role": "user",
                "content": json.dumps(instructions, ensure_ascii=False, separators=(",", ":")),
            },
        ]

    def _decode_package(
        self, content: str, request: AnalyzeRequest
    ) -> LearningPackage:
        if len(content) > 200000:
            raise ValueError("provider JSON content exceeds 200000 characters")
        data = json.loads(content)
        return LearningPackage.model_validate(
            data,
            strict=True,
            context={
                "source_ids": {chunk.source_id for chunk in request.chunks},
                "requested_outputs": set(request.requested_outputs),
            },
        )

    async def _request_provider(
        self, provider: ProviderEndpoint, messages: list[dict[str, str]]
    ) -> str:
        payload = {
            "model": provider.model,
            "messages": messages,
            "response_format": {"type": "json_object"},
            "temperature": 1 if provider.name == "kimi" else 0.2,
        }
        last_error: ProviderError | None = None
        for retry in range(self.max_retries + 1):
            try:
                endpoint = await asyncio.to_thread(validate_provider_url, provider.base_url)
                async with httpx.AsyncClient(
                    timeout=self.timeout,
                    follow_redirects=False,
                    transport=self.transport,
                ) as client:
                    response = await client.post(
                        endpoint,
                        json=payload,
                        headers={"Authorization": f"Bearer {provider.api_key}"},
                    )
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                last_error = ProviderUnavailable(
                    f"{provider.name} connection failed after bounded retries"
                )
                last_error.__cause__ = exc
                if retry < self.max_retries:
                    await asyncio.sleep(self.retry_backoff * (2**retry))
                    continue
                break
            except ProviderConfigurationError as exc:
                last_error = exc
                break
            if response.status_code == 200:
                try:
                    body = response.json()
                    content = body["choices"][0]["message"]["content"]
                except (ValueError, KeyError, IndexError, TypeError) as exc:
                    raise ProviderInvalidResponse(
                        f"{provider.name} returned an invalid chat completions envelope"
                    ) from exc
                if not isinstance(content, str):
                    raise ProviderInvalidResponse(
                        f"{provider.name} message content must be a string"
                    )
                self.model_used = provider.model
                return content
            last_error = ProviderUnavailable(
                f"{provider.name} returned HTTP {response.status_code} after bounded retries"
            )
            if response.status_code == 429 or 500 <= response.status_code <= 599:
                if retry < self.max_retries:
                    await asyncio.sleep(self.retry_backoff * (2**retry))
                    continue
            break
        if last_error is not None:
            raise last_error
        raise ProviderUnavailable("AI provider request failed")

    async def _request_chat(self, messages: list[dict[str, str]]) -> str:
        last_error: ProviderError | None = None
        for provider in self.endpoints:
            try:
                return await self._request_provider(provider, messages)
            except ProviderError as exc:
                last_error = exc
        if last_error is not None:
            raise last_error
        raise ProviderUnavailable("AI provider request failed")
