from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import socket
import time
from urllib.parse import urlsplit

import httpx
from pydantic import ValidationError

from .config import Settings
from .provider_catalog import ProviderEndpoint, provider_endpoints_from_env
from .schemas import AnalyzeRequest, LearningPackage

PROMPT_VERSION = "learning-pack-v1"
SCHEMA_VERSION = "1.0"

logger = logging.getLogger(__name__)


class ProviderError(RuntimeError):
    pass


class ProviderConfigurationError(ProviderError):
    pass


class ProviderUnavailable(ProviderError):
    pass


class ProviderInvalidResponse(ProviderError):
    pass


class ProviderAttemptError(ProviderUnavailable):
    """A single failed HTTP attempt, with enough detail to decide failover."""

    def __init__(self, message: str, *, retryable: bool, status_code: int | None = None) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.status_code = status_code


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
        assert_global_address(address)
    return base_url.rstrip("/") + "/chat/completions"


def assert_global_address(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> None:
    """Reject loopback, private, reserved, link-local, multicast and unspecified addresses."""
    if (
        address.is_loopback
        or address.is_private
        or address.is_reserved
        or address.is_link_local
        or address.is_multicast
        or address.is_unspecified
        or not address.is_global
    ):
        raise ProviderConfigurationError("AI provider URL resolves to a forbidden address")


def resolve_global_address(hostname: str, port: int) -> str:
    """Resolve `hostname` to one validated global literal address.

    Complements validate_provider_url: callers connect to the returned literal
    address (with the original hostname as SNI/Host) so a second DNS lookup
    inside the HTTP client cannot re-point the connection to another host.
    """
    hostname = (hostname or "").rstrip(".").lower()
    if not hostname:
        raise ProviderConfigurationError("Hostname is required")
    try:
        literal = ipaddress.ip_address(hostname)
    except ValueError:
        literal = None
    if literal is not None:
        assert_global_address(literal)
        return str(literal)
    try:
        infos = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise ProviderConfigurationError("Host could not be resolved") from exc
    for info in infos:
        try:
            address = ipaddress.ip_address(info[4][0])
        except ValueError as exc:
            raise ProviderConfigurationError("Resolved address is invalid") from exc
        assert_global_address(address)
        return str(address)
    raise ProviderConfigurationError("Host did not resolve to an address")


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
        self.pack_timeout = settings.provider_pack_timeout_seconds
        self.max_retries = settings.provider_max_retries
        self.retry_backoff = settings.provider_retry_backoff_seconds
        self.cooldown_seconds = settings.provider_cooldown_seconds
        self.parallel = settings.provider_parallel
        self.transport = transport
        self.model_used = self.model
        self._cooldowns: dict[str, float] = {}
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

    def _ordered_endpoints(self, providers: list[ProviderEndpoint]) -> list[ProviderEndpoint]:
        now = time.monotonic()
        available = [
            provider
            for provider in providers
            if self._cooldowns.get(provider.name, 0.0) <= now
        ]
        # If every provider is cooling down, try them anyway: a short outage is
        # still better served by one attempt than by failing immediately.
        return available or list(providers)

    def _cool_down(self, provider: ProviderEndpoint, seconds: float | None = None) -> None:
        self._cooldowns[provider.name] = time.monotonic() + (
            self.cooldown_seconds if seconds is None else seconds
        )

    async def _send_chat_request(
        self,
        provider: ProviderEndpoint,
        messages: list[dict[str, str]],
        *,
        timeout_seconds: float | None = None,
    ) -> str:
        """One HTTP attempt. Retry/failover decisions belong to the caller."""
        payload = {
            "model": provider.model,
            "messages": messages,
            "response_format": {"type": "json_object"},
            "temperature": 1 if provider.name == "kimi" else 0.2,
        }
        request_timeout = self.timeout if timeout_seconds is None else timeout_seconds
        started = time.monotonic()
        try:
            endpoint = await asyncio.to_thread(validate_provider_url, provider.base_url)
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(request_timeout, connect=10.0),
                follow_redirects=False,
                transport=self.transport,
            ) as client:
                response = await client.post(
                    endpoint,
                    json=payload,
                    headers={"Authorization": f"Bearer {provider.api_key}"},
                )
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            self._cool_down(provider)
            logger.warning(
                "provider=%s model=%s outcome=network_error elapsed=%.2fs",
                provider.name,
                provider.model,
                time.monotonic() - started,
            )
            raise ProviderAttemptError(
                f"{provider.name} connection failed", retryable=True
            ) from exc
        except ProviderConfigurationError:
            self._cool_down(provider, seconds=300)
            raise

        elapsed = time.monotonic() - started
        if response.status_code == 200:
            try:
                body = response.json()
                content = body["choices"][0]["message"]["content"]
            except (ValueError, KeyError, IndexError, TypeError) as exc:
                logger.warning(
                    "provider=%s model=%s outcome=invalid_envelope status=200 elapsed=%.2fs",
                    provider.name,
                    provider.model,
                    elapsed,
                )
                raise ProviderInvalidResponse(
                    f"{provider.name} returned an invalid chat completions envelope"
                ) from exc
            if not isinstance(content, str):
                raise ProviderInvalidResponse(
                    f"{provider.name} message content must be a string"
                )
            self._cooldowns.pop(provider.name, None)
            self.model_used = provider.model
            logger.info(
                "provider=%s model=%s outcome=ok status=200 elapsed=%.2fs",
                provider.name,
                provider.model,
                elapsed,
            )
            return content

        retryable = response.status_code == 429 or 500 <= response.status_code <= 599
        if retryable:
            self._cool_down(provider)
        elif response.status_code in (400, 401, 403, 404):
            # A bad model/key configuration will not heal in seconds; skip this
            # provider for longer so other brands can serve the request.
            self._cool_down(provider, seconds=300)
        logger.warning(
            "provider=%s model=%s outcome=http_%s retryable=%s elapsed=%.2fs",
            provider.name,
            provider.model,
            response.status_code,
            retryable,
            elapsed,
        )
        raise ProviderAttemptError(
            f"{provider.name} returned HTTP {response.status_code}",
            retryable=retryable,
            status_code=response.status_code,
        )

    async def _request_provider_once(
        self,
        provider: ProviderEndpoint,
        messages: list[dict[str, str]],
        *,
        timeout_seconds: float | None = None,
    ) -> str:
        """One attempt, used by the fast failover chain."""
        return await self._send_chat_request(
            provider, messages, timeout_seconds=timeout_seconds
        )

    async def _request_provider(
        self, provider: ProviderEndpoint, messages: list[dict[str, str]]
    ) -> str:
        """Single-provider call with bounded retries (legacy direct callers)."""
        last_error: ProviderAttemptError | None = None
        for retry in range(self.max_retries + 1):
            try:
                return await self._send_chat_request(provider, messages)
            except ProviderAttemptError as exc:
                last_error = exc
                if exc.retryable and retry < self.max_retries:
                    await asyncio.sleep(self.retry_backoff * (2**retry))
                    continue
                break
        raise ProviderUnavailable(
            f"{provider.name} request failed after bounded retries"
        ) from last_error

    async def _request_chat(self, messages: list[dict[str, str]]) -> str:
        """Round-robin failover: one attempt per healthy provider before retrying."""
        last_error: ProviderError | None = None
        for attempt in range(self.max_retries + 1):
            for provider in self._ordered_endpoints(self.endpoints):
                try:
                    return await self._send_chat_request(provider, messages)
                except ProviderError as exc:
                    last_error = exc
            if attempt < self.max_retries:
                await asyncio.sleep(self.retry_backoff * (2**attempt))
        if isinstance(last_error, ProviderAttemptError):
            raise ProviderUnavailable(
                "AI provider request failed after bounded retries"
            ) from last_error
        if last_error is not None:
            raise last_error
        raise ProviderUnavailable("AI provider request failed")
