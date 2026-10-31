from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote, urlsplit

import httpx

from .provider import ProviderConfigurationError, ProviderInvalidResponse, ProviderUnavailable, validate_provider_url
from .v2_schemas import TranslateRequest

LECSYNC_BASE_URL = "https://api.lecsync.com/v1"
LECSYNC_MODEL = "translate-default"
_PENDING_STATUSES = {"accepted", "processing"}
_TARGET_LANGUAGES = {"zh-CN": "zh", "en-US": "en"}
_AUDIO_MIME = {
    ".wav": "audio/wav", ".mp3": "audio/mpeg", ".aac": "audio/aac",
    ".ogg": "audio/ogg", ".opus": "audio/ogg", ".mp4": "audio/mp4",
    ".m4a": "audio/mp4",
}


class LecsyncUnavailable(ProviderUnavailable):
    pass


class LecsyncInvalidResponse(ProviderInvalidResponse):
    pass


class LecsyncError(LecsyncUnavailable):
    def __init__(self, message: str, *, status: int = 503, code: str = "SERVICE_UNAVAILABLE",
                 request_id: str | None = None, retry_after: float | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.request_id = request_id
        self.retry_after = retry_after


@dataclass(frozen=True, slots=True)
class LecsyncTranslation:
    request_id: str
    text: str
    model: str


def build_idempotency_key(request: TranslateRequest) -> str:
    return f"lecsync-translate-v1-line{request.line_id}-{request.source_hash}-{_TARGET_LANGUAGES[request.target_lang]}"


def valid_idempotency_key(value: str) -> str:
    if not 1 <= len(value) <= 128 or any(not 33 <= ord(char) <= 126 for char in value):
        raise LecsyncError("Invalid idempotency key", status=422, code="INVALID_IDEMPOTENCY_KEY")
    return value


def audio_mime(filename: str) -> str:
    suffix = os.path.splitext(filename)[1].lower()
    if suffix not in _AUDIO_MIME:
        raise LecsyncError("Unsupported audio format", status=415, code="UNSUPPORTED_AUDIO_FORMAT")
    return _AUDIO_MIME[suffix]


class LecsyncClient:
    def __init__(self, api_key: str | None = None, *, transport: httpx.AsyncBaseTransport | None = None,
                 timeout: float = 30.0, status_poll_interval: float = 0.5, max_status_checks: int = 2) -> None:
        if timeout <= 0 or status_poll_interval < 0 or max_status_checks < 0:
            raise ValueError("Invalid Lecsync polling configuration")
        self._api_key = api_key if api_key is not None else os.getenv("LECSYNC_API_KEY")
        self._transport = transport
        self._timeout = timeout
        self._status_poll_interval = status_poll_interval
        self._max_status_checks = max_status_checks

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    @property
    def api_key(self) -> str:
        if not self._api_key:
            raise ProviderConfigurationError("Lecsync is not configured")
        return self._api_key

    async def translate(self, request: TranslateRequest | dict[str, Any], idempotency_key: str | None = None):
        if isinstance(request, TranslateRequest):
            payload = {
                "text": request.source_text,
                "source_lang": "auto",
                "target_lang": _TARGET_LANGUAGES[request.target_lang],
                "context": "", "terms": [], "model": LECSYNC_MODEL,
            }
            key = idempotency_key or build_idempotency_key(request)
            envelope = await self._translate_payload(payload, key)
            if envelope.get("status") in _PENDING_STATUSES:
                envelope = await self._wait_request(str(envelope["request_id"]))
            if envelope.get("status") != "succeeded":
                raise LecsyncInvalidResponse("Lecsync returned an invalid translation status")
            result = self._result(envelope)
            return LecsyncTranslation(str(envelope["request_id"]), str(result["text"]).strip(), str(result["model"]))
        key = valid_idempotency_key(idempotency_key or self.key_for("translate", request))
        return await self._translate_payload(request, key)

    async def _translate_payload(self, payload: dict[str, Any], key: str) -> dict:
        text = payload.get("text")
        if not isinstance(text, str) or not text or len(text) > 2000:
            raise LecsyncError("Translation text must contain 1-2000 characters", status=422, code="INVALID_INPUT")
        if not payload.get("target_lang"):
            raise LecsyncError("Target language is required", status=422, code="INVALID_INPUT")
        if len(payload.get("context", "")) > 2000 or len(payload.get("terms", [])) > 20:
            raise LecsyncError("Translation context or terminology is too large", status=422, code="INVALID_INPUT")
        envelope = await self._request("POST", "/translate", json=payload, idempotency_key=key)
        if envelope.get("status") == "succeeded":
            result = self._result(envelope)
            if not isinstance(result.get("text"), str) or not result["text"].strip():
                raise LecsyncInvalidResponse("Lecsync succeeded without valid translation text")
        return envelope

    async def models(self) -> dict:
        return await self._request("GET", "/models")

    async def request_status(self, request_id: str) -> dict:
        return await self._request("GET", f"/requests/{self._id(request_id)}")

    async def transcribe_sync(self, file: bytes, filename: str, options: dict[str, Any],
                              idempotency_key: str) -> dict:
        self._check_audio(file, 20 * 1024 * 1024)
        fields = {"model": options.get("model"), "language": options.get("language", "auto"),
                  "timestamps": options.get("timestamps", "none"),
                  "diarization": str(bool(options.get("diarization", False))).lower()}
        fields = {key: value for key, value in fields.items() if value is not None}
        if options.get("hotwords"):
            import json
            fields["hotwords"] = json.dumps(options["hotwords"], ensure_ascii=False)
        return await self._request("POST", "/audio/transcriptions", files=self._files(file, filename, fields), idempotency_key=idempotency_key)

    async def create_audio_upload(self, size_bytes: int, sha256: str) -> dict:
        if not 1 <= size_bytes <= 200 * 1024 * 1024:
            raise LecsyncError("Audio exceeds the 200 MiB limit", status=413, code="BODY_TOO_LARGE")
        if len(sha256) != 64 or any(char not in "0123456789abcdef" for char in sha256):
            raise LecsyncError("Invalid audio digest", status=422, code="INVALID_INPUT")
        return await self._request("POST", "/audio/uploads", json={"size_bytes": size_bytes, "sha256": sha256})

    async def upload_created_file(self, upload: dict, file: bytes) -> None:
        url = upload.get("upload_url")
        if not isinstance(url, str) or urlsplit(url).scheme != "https" or not urlsplit(url).hostname:
            raise LecsyncInvalidResponse("Invalid managed upload URL")
        await asyncio.to_thread(validate_provider_url, url)
        headers = upload.get("headers")
        if not isinstance(headers, dict) or any(not isinstance(key, str) or not isinstance(value, str) for key, value in headers.items()):
            raise LecsyncInvalidResponse("Invalid managed upload headers")
        try:
            async with self._http_client() as client:
                response = await client.put(url, content=file, headers=headers)
        except httpx.TransportError as exc:
            raise LecsyncError("Managed audio upload failed") from exc
        if response.status_code not in {200, 201, 204}:
            raise LecsyncError("Managed audio upload was rejected", status=502, code="UPLOAD_FAILED")

    async def create_transcription_job(self, options: dict[str, Any], idempotency_key: str) -> dict:
        if not isinstance(options.get("input"), dict) or len(options["input"]) != 1:
            raise LecsyncError("Exactly one audio input is required", status=422, code="INVALID_INPUT")
        return await self._request("POST", "/audio/transcription-jobs", json=options, idempotency_key=idempotency_key)

    async def transcription_job(self, job_id: str) -> dict:
        return await self._request("GET", f"/audio/transcription-jobs/{self._id(job_id)}")

    async def transcription_result(self, job_id: str, cursor: int = 0) -> dict:
        return await self._request("GET", f"/audio/transcription-jobs/{self._id(job_id)}/result", params={"cursor": cursor})

    async def cancel_transcription_job(self, job_id: str, idempotency_key: str | None = None) -> dict:
        return await self._request("POST", f"/audio/transcription-jobs/{self._id(job_id)}/cancel", idempotency_key=idempotency_key)

    async def delete_transcription_job(self, job_id: str) -> dict:
        return await self._request("DELETE", f"/audio/transcription-jobs/{self._id(job_id)}")

    async def voice_typing(self, file: bytes, filename: str, options: dict[str, Any], idempotency_key: str) -> dict:
        self._check_audio(file, 20 * 1024 * 1024)
        if filename.lower().endswith((".mp4", ".m4a")):
            raise LecsyncError("Voice typing does not accept MP4", status=415, code="UNSUPPORTED_AUDIO_FORMAT")
        import json
        fields = {key: value for key, value in options.items() if value is not None}
        for key in ("terms", "hotwords"):
            if key in fields and not isinstance(fields[key], str):
                fields[key] = json.dumps(fields[key], ensure_ascii=False)
        if "polish" in fields:
            fields["polish"] = str(bool(fields["polish"])).lower()
        return await self._request("POST", "/voicetyping", files=self._files(file, filename, fields), idempotency_key=idempotency_key)

    async def voice_typing_status(self, request_id: str) -> dict:
        return await self._request("GET", f"/voicetyping/requests/{self._id(request_id)}")

    async def voice_typing_connect(self, options: dict[str, Any]) -> dict:
        return await self._request("POST", "/voicetyping/connect", json=options)

    async def realtime_connect(self, config: dict[str, Any]) -> dict:
        return await self._request("POST", "/realtime/connect", json=config)

    async def recording(self, session_id: str) -> dict:
        return await self._request("GET", f"/recordings/{self._id(session_id)}")

    async def delete_recording(self, session_id: str) -> dict:
        return await self._request("DELETE", f"/recordings/{self._id(session_id)}")

    async def recording_download(self, url: str) -> tuple[bytes, str]:
        if urlsplit(url).scheme != "https" or not urlsplit(url).hostname:
            raise LecsyncInvalidResponse("Invalid recording URL")
        await asyncio.to_thread(validate_provider_url, url)
        try:
            async with self._http_client() as client:
                response = await client.get(url)
        except httpx.TransportError as exc:
            raise LecsyncError("Recording download failed") from exc
        if response.status_code != 200:
            raise LecsyncError("Recording download failed", status=502)
        if len(response.content) > 250 * 1024 * 1024:
            raise LecsyncError("Recording is too large", status=413)
        return response.content, response.headers.get("content-type", "application/octet-stream")

    async def create_webhook(self, url: str, idempotency_key: str) -> dict:
        await asyncio.to_thread(validate_provider_url, url)
        return await self._request("POST", "/webhooks", json={"url": url}, idempotency_key=idempotency_key)

    async def webhook_deliveries(self, webhook_id: str) -> dict:
        return await self._request("GET", f"/webhooks/{self._id(webhook_id)}/deliveries")

    async def resend_webhook(self, delivery_id: str, idempotency_key: str) -> dict:
        return await self._request("POST", f"/webhooks/deliveries/{self._id(delivery_id)}/resend", idempotency_key=idempotency_key)

    async def rotate_webhook_secret(self, webhook_id: str, idempotency_key: str) -> dict:
        return await self._request("POST", f"/webhooks/{self._id(webhook_id)}/rotate-secret", idempotency_key=idempotency_key)

    async def _request(self, method: str, path: str, *, json: dict | None = None,
                       files: dict | None = None, params: dict | None = None,
                       idempotency_key: str | None = None) -> dict:
        validated_base = await asyncio.to_thread(validate_provider_url, LECSYNC_BASE_URL)
        url = validated_base.removesuffix("/chat/completions") + path
        headers = {"Authorization": f"Bearer {self.api_key}"}
        if idempotency_key:
            headers["Idempotency-Key"] = valid_idempotency_key(idempotency_key)
        try:
            async with self._http_client() as client:
                response = await client.request(method, url, json=json, files=files, params=params, headers=headers)
        except httpx.TransportError as exc:
            raise LecsyncError("Lecsync network connection failed", code="NETWORK_UNAVAILABLE") from exc
        if response.status_code not in {200, 201, 202, 204}:
            if response.status_code == 504 and path == "/translate":
                try:
                    body = response.json()
                    request_id = body.get("request_id") if isinstance(body, dict) else None
                except (TypeError, ValueError):
                    request_id = None
                if isinstance(request_id, str) and request_id:
                    return await self._wait_request(request_id)
            self._raise_http(response)
        if response.status_code == 204 or not response.content:
            return {}
        try:
            envelope = response.json()
        except (TypeError, ValueError):
            raise LecsyncInvalidResponse("Lecsync returned invalid JSON") from None
        if not isinstance(envelope, dict):
            raise LecsyncInvalidResponse("Lecsync response must be a JSON object")
        return envelope

    @staticmethod
    def _raise_http(response: httpx.Response) -> None:
        try:
            body = response.json()
        except (TypeError, ValueError):
            body = {}
        if not isinstance(body, dict):
            body = {}
        code = body.get("error") or body.get("code") or "SERVICE_UNAVAILABLE"
        request_id = body.get("request_id") or response.headers.get("X-Request-Id")
        retry_after = None
        try:
            retry_after = float(response.headers["Retry-After"])
        except (KeyError, ValueError):
            pass
        raise LecsyncError(str(code), status=response.status_code, code=str(code), request_id=request_id, retry_after=retry_after)

    async def _wait_request(self, request_id: str) -> dict:
        for check in range(self._max_status_checks):
            if check:
                await asyncio.sleep(self._status_poll_interval)
            envelope = await self.request_status(request_id)
            if envelope.get("request_id") != request_id:
                raise LecsyncInvalidResponse("Lecsync returned a mismatched request id")
            if envelope.get("status") not in _PENDING_STATUSES:
                return envelope
        raise LecsyncError("Lecsync request is still pending", code="REQUEST_PENDING")

    @staticmethod
    def _result(envelope: dict) -> dict:
        result = envelope.get("result", envelope)
        if not isinstance(result, dict):
            raise LecsyncInvalidResponse("Lecsync result must be a JSON object")
        return result

    @staticmethod
    def _id(value: str) -> str:
        if not value or len(value) > 256 or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for char in value):
            raise LecsyncError("Invalid upstream identifier", status=422, code="INVALID_INPUT")
        return quote(value, safe="")

    @staticmethod
    def _check_audio(file: bytes, maximum: int) -> None:
        if not file or len(file) > maximum:
            raise LecsyncError("Audio file is empty or too large", status=413, code="BODY_TOO_LARGE")

    @staticmethod
    def _files(file: bytes, filename: str, fields: dict[str, str]) -> dict:
        safe_name = os.path.basename(filename) or "audio.wav"
        return {key: (None, value) for key, value in fields.items()} | {"file": (safe_name, file, audio_mime(safe_name))}

    @staticmethod
    def key_for(kind: str, payload: Any) -> str:
        import json
        def normalize(value):
            if isinstance(value, bytes):
                return {"sha256": hashlib.sha256(value).hexdigest(), "size": len(value)}
            if isinstance(value, dict):
                return {key: normalize(item) for key, item in value.items()}
            if isinstance(value, (list, tuple)):
                return [normalize(item) for item in value]
            if hasattr(value, "model_dump"):
                return normalize(value.model_dump(by_alias=True))
            return value
        digest = hashlib.sha256(json.dumps(normalize(payload), ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        return f"lecsync-{kind}-{digest}"

    def _http_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=self._timeout, follow_redirects=False, transport=self._transport)


def verify_webhook_signature(raw_body: bytes, timestamp: str, signature: str, secret: str, *, now: float | None = None) -> None:
    try:
        if abs((time.time() if now is None else now) - float(timestamp)) > 300:
            raise ValueError
    except ValueError:
        raise LecsyncError("Webhook timestamp is outside the allowed window", status=401, code="INVALID_SIGNATURE") from None
    expected = "v1=" + hmac.new(secret.encode(), timestamp.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise LecsyncError("Webhook signature verification failed", status=401, code="INVALID_SIGNATURE")
