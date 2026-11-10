from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
import uuid
from collections import OrderedDict
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from pydantic import ValidationError

from .accounts import require_active_account, resolve_quota_subject
from .config import Settings
from .db import AccountError, QuotaExceeded
from .lecsync import LecsyncClient, LecsyncError, audio_mime, verify_webhook_signature
from .lecsync_gateway_schemas import (
    AudioOptions, RealtimeConfig, TranslationOptions, VoiceTypingOptions,
    AudioUrlJobRequest, camel_fields, snake_fields,
)
from .lecsync_realtime import LecsyncRealtimeConnection, StreamLimiter
from .provider import ProviderConfigurationError, ProviderInvalidResponse, resolve_global_address, validate_provider_url
from .rate_limit import SlidingWindowRateLimiter
from .security import token_digest


async def reject_websocket(socket: WebSocket, code: int, reason: str = "", subprotocol: str | None = None) -> None:
    """Reject after accept so browsers receive the close code.

    Calling close() before accept() becomes an HTTP 403 handshake failure. iOS
    WeChat's WKWebView often surfaces that as a silent hang (CONNECTING forever)
    instead of a usable onclose code such as 4401/4403/4429.
    """
    try:
        await socket.accept(subprotocol=subprotocol)
    except Exception:
        return
    await socket.close(code=code, reason=reason)


def register_lecsync_routes(app: FastAPI, settings: Settings) -> None:
    limiter = SlidingWindowRateLimiter(settings.lecsync_rate_limit, 60)
    streams = StreamLimiter(settings.lecsync_max_concurrent_streams)
    cache: OrderedDict[tuple, tuple[float, dict]] = OrderedDict()
    upload_root = Path(os.getenv("LECSYNC_UPLOAD_ROOT", "lecsync_uploads")).resolve()
    upload_root.mkdir(parents=True, exist_ok=True)
    if not hasattr(app.state, "lecsync_connection_factory"):
        app.state.lecsync_connection_factory = LecsyncRealtimeConnection

    def client() -> LecsyncClient:
        return app.state.lecsync

    def device_id(token: str | None) -> str:
        if not token or not settings.token_pepper:
            raise HTTPException(status_code=401, detail="A valid device credential is required")
        device = app.state.db.find_device_by_token_hash(token_digest(token, settings.token_pepper))
        if device is None:
            raise HTTPException(status_code=401, detail="Invalid device token")
        return device

    from fastapi import Header

    def authenticated(request: Request, authorization: str | None = Header(default=None)) -> str:
        scheme, _, token = (authorization or "").partition(" ")
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="A valid bearer device token is required")
        device = device_id(token)
        try:
            account = require_active_account(app.state.db, settings, device)
        except AccountError as account_error:
            raise HTTPException(
                status_code=account_error.status_code,
                detail={"code": account_error.code.upper(), "message": str(account_error)},
                headers={"X-Zhixi-Error-Code": account_error.code},
            ) from account_error
        request.state.device_id = device
        request.state.account_id = None if account is None else str(account["id"])
        return device

    def check_rate(device: str) -> None:
        if not limiter.allow(device) or not limiter.allow("lecsync-global"):
            raise HTTPException(status_code=429, detail={"code": "RESOURCE_LIMIT", "message": "请求较频繁，请稍后再试", "retryAfter": 5})

    def error(exc: Exception) -> HTTPException:
        if isinstance(exc, LecsyncError):
            messages = {
                "INSUFFICIENT_BALANCE": "云端学习额度不足，请联系管理员",
                "UNAUTHORIZED": "云端服务暂时不可用，请联系管理员",
                "RESOURCE_LIMIT": "云端服务较忙，请稍后重试",
                "RESULT_EXPIRED": "结果已过期，请重新提交",
                "RESULT_NOT_READY": "任务仍在处理中，请稍后查看",
                "IDEMPOTENCY_CONFLICT": "任务参数已变化，请重新提交",
                "UNSUPPORTED_LANGUAGE": "暂不支持所选语言",
                "UNSUPPORTED_AUDIO_FORMAT": "暂不支持该音频格式",
                "AUDIO_TOO_LONG": "音频超过单次处理时长",
                "BODY_TOO_LARGE": "音频超过上传大小限制",
            }
            status = 502 if exc.status == 401 else exc.status
            code = "UPSTREAM_UNAUTHORIZED" if exc.status == 401 else exc.code
            return HTTPException(status, {"code": code, "message": messages.get(exc.code, "云端处理暂时失败，请稍后重试"), "retryAfter": exc.retry_after})
        if isinstance(exc, ProviderConfigurationError):
            return HTTPException(503, {"code": "NOT_CONFIGURED", "message": "云端学习服务尚未配置"})
        return HTTPException(502, {"code": "UPSTREAM_INVALID", "message": "云端返回了无法识别的结果"})

    async def call(operation, *args):
        try:
            return await operation(*args)
        except (LecsyncError, ProviderConfigurationError, ProviderInvalidResponse) as exc:
            raise error(exc) from exc

    def public(payload: Any) -> Any:
        if isinstance(payload, dict):
            return {
                key: public(value) for key, value in payload.items()
                if key not in {"upload_url", "uploadUrl", "headers", "audio_url", "audioUrl", "transcript_url", "transcriptUrl", "token", "ticket", "websocket_url", "websocketUrl", "url", "secret", "api_key", "apiKey"}
            }
        if isinstance(payload, list):
            return [public(item) for item in payload]
        return payload

    def normalize(payload: Any) -> Any:
        return camel_fields(public(payload))

    def audio_seconds(payload: dict, default: float) -> float:
        usage = payload.get("usage") or {}
        for key in ("audio_seconds", "duration_seconds", "effective_seconds", "billed_seconds"):
            value = usage.get(key)
            if isinstance(value, (int, float)):
                return max(0, float(value))
        result = payload.get("result") or {}
        for key in ("audio_seconds", "duration_seconds"):
            value = result.get(key)
            if isinstance(value, (int, float)):
                return max(0, float(value))
        return default

    def finish_task(device: str, task_id: str, kind: str, result: dict, reserved: float = 0) -> dict:
        current = app.state.db.own_lecsync_task(device, task_id)
        if current is not None:
            actual = audio_seconds(result, current["actual_seconds"])
            if reserved or actual:
                app.state.db.settle_lecsync_task_audio(device, task_id, actual)
            app.state.db.update_lecsync_task(device, task_id, status=str(result.get("status", "succeeded")), upstream_request_id=result.get("request_id"), actual_seconds=actual, usage=result.get("usage") if isinstance(result.get("usage"), dict) else {})
        return normalize(result)

    def task_id(result: dict, fallback: str | None = None) -> str:
        return str(result.get("job_id") or result.get("request_id") or fallback or uuid.uuid4())

    async def read_audio(file: UploadFile, maximum: int, maximum_seconds: float, device: str) -> tuple[bytes, float]:
        content = await file.read(maximum + 1)
        if not content or len(content) > maximum:
            raise HTTPException(413, {"code": "BODY_TOO_LARGE", "message": "音频超过上传大小限制"})
        audio_mime(file.filename or "")
        seconds = measured_seconds(content, maximum_seconds, maximum_seconds)
        try:
            subject = resolve_quota_subject(app.state.db, settings, device)
            app.state.db.reserve_lecsync_audio(
                device, seconds, subject.limits.audio_seconds, subject.account_id
            )
        except AccountError as account_error:
            raise HTTPException(
                status_code=account_error.status_code,
                detail={"code": account_error.code.upper(), "message": str(account_error)},
                headers={"X-Zhixi-Error-Code": account_error.code},
            ) from account_error
        except QuotaExceeded as quota_error:
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "AUDIO_QUOTA_EXCEEDED",
                    "message": "今日云端音频额度已用完，请联系管理员或明天再试",
                },
                headers={
                    "X-Zhixi-Error-Code": "quota_exceeded",
                    "X-Zhixi-Quota-Scope": "audio",
                },
            ) from quota_error
        return content, seconds

    # The upload duration is checked by a tiny RIFF parser before any billed call.
    def wav_duration(data: bytes) -> float | None:
        import struct
        if len(data) < 44 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
            return None
        offset = 12
        rate = channels = bits = None
        size = None
        while offset + 8 <= len(data):
            name = data[offset:offset + 4]
            length = struct.unpack_from("<I", data, offset + 4)[0]
            body = offset + 8
            if name == b"fmt " and length >= 16 and body + 16 <= len(data):
                _, channels, rate, _, _, bits = struct.unpack_from("<HHIIHH", data, body)
            elif name == b"data":
                size = min(length, max(0, len(data) - body))
            offset = body + length + (length % 2)
        if not rate or not channels or not bits or size is None:
            return None
        return size / (rate * channels * bits / 8)

    def measured_seconds(data: bytes, estimate: float, maximum: float) -> float:
        actual = wav_duration(data)
        if actual is None:
            from io import BytesIO
            from mutagen import File as AudioMetadata
            try:
                metadata = AudioMetadata(BytesIO(data))
                value = getattr(metadata.info, "length", None) if metadata else None
                actual = float(value) if value else None
            except Exception:
                actual = None
        actual = actual or estimate
        if actual > maximum:
            raise HTTPException(413, {"code": "AUDIO_TOO_LONG", "message": "音频超过单次处理时长"})
        return actual

    @app.get("/v2/lecsync/models")
    async def models(device: str = Depends(authenticated)):
        check_rate(device)
        return normalize(await call(client().models))

    @app.post("/v2/lecsync/translate")
    async def translate(payload: TranslationOptions, device: str = Depends(authenticated)):
        check_rate(device)
        actual_hash = hashlib.sha256(payload.sourceText.encode()).hexdigest()
        if payload.sourceHash and payload.sourceHash != actual_hash:
            raise HTTPException(422, {"code": "SOURCE_HASH_MISMATCH", "message": "原文已变化，请重新提交"})
        options = snake_fields(payload.model_dump(by_alias=True, exclude={"lineId", "sourceHash"}, exclude_none=True))
        cache_key = (device, json.dumps(options, ensure_ascii=False, sort_keys=True))
        cached = cache.get(cache_key)
        if cached and time.monotonic() - cached[0] < 3600:
            return cached[1]
        try:
            app.state.db.reserve_lecsync_text(device, len(payload.sourceText), settings.lecsync_daily_text_quota)
        except QuotaExceeded as exc:
            raise HTTPException(429, {"code": "TEXT_QUOTA_EXCEEDED", "message": "今日云端翻译额度已用完"}) from exc
        try:
            result = await call(client().translate, options, client().key_for(f"translate-{device}", options))
        except HTTPException:
            app.state.db.release_lecsync_text(device, len(payload.sourceText))
            raise
        response = normalize(result)
        if isinstance(result.get("request_id"), str):
            identifier = result["request_id"]
            app.state.db.create_lecsync_task(device, identifier, "translation", upstream_request_id=identifier)
            finish_task(device, identifier, "translation", result)
        if isinstance(response, dict) and payload.lineId is not None:
            response["lineId"] = payload.lineId
        cache[cache_key] = (time.monotonic(), response)
        cache.move_to_end(cache_key)
        while len(cache) > 500:
            cache.popitem(last=False)
        return response

    @app.get("/v2/lecsync/requests/{request_id}")
    async def request_status(request_id: str, device: str = Depends(authenticated)):
        check_rate(device)
        if app.state.db.own_lecsync_task(device, request_id) is None:
            raise HTTPException(404, {"code": "NOT_FOUND", "message": "找不到该任务"})
        result = await call(client().request_status, request_id)
        return finish_task(device, request_id, "request", result)

    @app.post("/v2/lecsync/audio/transcriptions")
    async def transcribe(file: UploadFile, options: str = "{}", device: str = Depends(authenticated)):
        check_rate(device)
        try:
            config = AudioOptions.model_validate_json(options)
        except ValidationError as exc:
            raise HTTPException(422, {"code": "INVALID_INPUT", "message": "音频处理选项不正确"}) from exc
        data, seconds = await read_audio(file, 20 * 1024 * 1024, 120, device)
        try:
            result = await call(client().transcribe_sync, data, file.filename or "audio.wav", snake_fields(config), client().key_for(f"transcribe-{device}", [data, config.model_dump()]))
        except HTTPException:
            app.state.db.settle_lecsync_audio(device, seconds, 0)
            raise
        identifier = task_id(result)
        app.state.db.create_lecsync_task(device, identifier, "transcription", upstream_request_id=result.get("request_id"), reserved_seconds=seconds)
        return finish_task(device, identifier, "transcription", result, seconds)

    @app.post("/v2/lecsync/audio/jobs")
    async def create_job(file: UploadFile, options: str = "{}", device: str = Depends(authenticated)):
        check_rate(device)
        try:
            config = AudioOptions.model_validate_json(options)
        except ValidationError as exc:
            raise HTTPException(422, {"code": "INVALID_INPUT", "message": "音频处理选项不正确"}) from exc
        data, seconds = await read_audio(file, 200 * 1024 * 1024, 7200, device)
        identifier = uuid.uuid4().hex
        try:
            # Parsed so the staging filename can only contain UUID characters.
            device_key = uuid.UUID(device)
        except ValueError as exc:
            raise HTTPException(401, {"code": "INVALID_TOKEN", "message": "设备身份无效"}) from exc
        path = upload_root / f"{device_key}-{identifier}"
        path.write_bytes(data)
        try:
            upload = await call(client().create_audio_upload, len(data), hashlib.sha256(data).hexdigest())
            await call(client().upload_created_file, upload, data)
            options_payload = {"input": {"upload_id": upload["upload_id"]}, **snake_fields(config)}
            result = await call(client().create_transcription_job, options_payload, client().key_for(f"job-{device}", options_payload))
        except HTTPException:
            app.state.db.settle_lecsync_audio(device, seconds, 0)
            raise
        finally:
            # The staging file is retained for retry/recovery, never served publicly.
            pass
        identifier = task_id(result, identifier)
        app.state.db.create_lecsync_task(device, identifier, "transcription_job", upstream_request_id=result.get("request_id"), reserved_seconds=seconds)
        return finish_task(device, identifier, "transcription_job", result, seconds)

    @app.post("/v2/lecsync/audio/jobs/url")
    async def create_url_job(payload: AudioUrlJobRequest, device: str = Depends(authenticated)):
        check_rate(device)
        from io import BytesIO
        from urllib.parse import urlsplit, urlunsplit
        import httpx
        try:
            await asyncio.to_thread(validate_provider_url, payload.fileUrl)
        except ProviderConfigurationError as exc:
            raise HTTPException(422, {"code": "INVALID_INPUT", "message": "音频地址不安全或不受支持"}) from exc
        # Pin the connection to an address validated at this moment: the HTTP
        # client connects to the literal IP while TLS and the Host header keep
        # identifying the original hostname, so a second DNS lookup inside the
        # client can never re-point the request at an internal address.
        parts = urlsplit(payload.fileUrl)
        port = parts.port or (443 if parts.scheme == "https" else 80)
        hostname = (parts.hostname or "").rstrip(".").lower()
        try:
            address = await asyncio.to_thread(resolve_global_address, hostname, port)
        except ProviderConfigurationError as exc:
            raise HTTPException(422, {"code": "INVALID_INPUT", "message": "音频地址不安全或不受支持"}) from exc
        default_port = port in (80, 443)
        netloc = f"[{address}]" if ":" in address else address
        if not default_port:
            netloc = f"{netloc}:{port}"
        pinned_url = urlunsplit((parts.scheme, netloc, parts.path or "/", "", ""))
        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=False, trust_env=False) as remote:
                async with remote.stream("GET", pinned_url, headers={"Host": parts.netloc}, extensions={"sni_hostname": hostname}) as response:
                    if response.status_code != 200:
                        raise HTTPException(422, {"code": "INVALID_INPUT", "message": "无法读取音频地址"})
                    content = bytearray()
                    async for chunk in response.aiter_bytes():
                        content.extend(chunk)
                        if len(content) > 200 * 1024 * 1024:
                            raise HTTPException(413, {"code": "BODY_TOO_LARGE", "message": "音频超过上传大小限制"})
        except httpx.TransportError as exc:
            raise HTTPException(422, {"code": "INVALID_INPUT", "message": "无法读取音频地址"}) from exc
        name = Path(parts.path).name or "audio.wav"
        return await create_job(UploadFile(file=BytesIO(content), filename=name), options=json.dumps(payload.options.model_dump()), device=device)

    @app.get("/v2/lecsync/audio/jobs/{job_id}")
    async def job_status(job_id: str, device: str = Depends(authenticated)):
        check_rate(device)
        if app.state.db.own_lecsync_task(device, job_id) is None:
            raise HTTPException(404, {"code": "NOT_FOUND", "message": "找不到该任务"})
        result = await call(client().transcription_job, job_id)
        return finish_task(device, job_id, "transcription_job", result)

    @app.get("/v2/lecsync/audio/jobs/{job_id}/result")
    async def job_result(job_id: str, cursor: int = 0, device: str = Depends(authenticated)):
        check_rate(device)
        if app.state.db.own_lecsync_task(device, job_id) is None:
            raise HTTPException(404, {"code": "NOT_FOUND", "message": "找不到该任务"})
        if cursor < 0:
            raise HTTPException(422, {"code": "INVALID_INPUT", "message": "分页参数不正确"})
        return normalize(await call(client().transcription_result, job_id, cursor))

    @app.post("/v2/lecsync/audio/jobs/{job_id}/cancel")
    async def cancel_job(job_id: str, device: str = Depends(authenticated)):
        if app.state.db.own_lecsync_task(device, job_id) is None:
            raise HTTPException(404, {"code": "NOT_FOUND", "message": "找不到该任务"})
        result = await call(client().cancel_transcription_job, job_id)
        return finish_task(device, job_id, "transcription_job", result)

    @app.delete("/v2/lecsync/audio/jobs/{job_id}")
    async def delete_job(job_id: str, device: str = Depends(authenticated)):
        current = app.state.db.own_lecsync_task(device, job_id)
        if current is None:
            raise HTTPException(404, {"code": "NOT_FOUND", "message": "找不到该任务"})
        result = await call(client().delete_transcription_job, job_id)
        app.state.db.update_lecsync_task(device, job_id, status="deleted")
        return normalize(result or {"deleted": True})

    @app.post("/v2/lecsync/voice-typing")
    async def voice_typing(file: UploadFile, options: str = "{}", device: str = Depends(authenticated)):
        check_rate(device)
        try:
            config = VoiceTypingOptions.model_validate_json(options)
        except ValidationError as exc:
            raise HTTPException(422, {"code": "INVALID_INPUT", "message": "语音输入选项不正确"}) from exc
        data, seconds = await read_audio(file, 20 * 1024 * 1024, 120, device)
        try:
            result = await call(client().voice_typing, data, file.filename or "audio.wav", config.model_dump(exclude_none=True), client().key_for(f"voicetyping-{device}", [data, config.model_dump()]))
        except HTTPException:
            app.state.db.settle_lecsync_audio(device, seconds, 0)
            raise
        identifier = task_id(result)
        app.state.db.create_lecsync_task(device, identifier, "voice_typing", upstream_request_id=result.get("request_id"), reserved_seconds=seconds)
        return finish_task(device, identifier, "voice_typing", result, seconds)

    @app.get("/v2/lecsync/voice-typing/requests/{request_id}")
    async def voice_typing_status(request_id: str, device: str = Depends(authenticated)):
        if app.state.db.own_lecsync_task(device, request_id) is None:
            raise HTTPException(404, {"code": "NOT_FOUND", "message": "找不到该任务"})
        return normalize(await call(client().voice_typing_status, request_id))

    async def proxy_socket(socket: WebSocket, kind: str):
        scheme, _, token = (socket.headers.get("authorization") or "").partition(" ")
        ws_subprotocol: str | None = None
        protocols = [p.strip() for p in (socket.headers.get("sec-websocket-protocol") or "").split(",") if p.strip()]
        if protocols and protocols[0].lower() == "bearer":
            ws_subprotocol = "bearer"
        if scheme.lower() != "bearer":
            # 浏览器无法为 WebSocket 设置 Authorization 头；允许客户端以
            # Sec-WebSocket-Protocol: bearer, <token> 的形式携带，成功后回显 bearer。
            if len(protocols) == 2 and protocols[0].lower() == "bearer":
                scheme, token = "bearer", protocols[1]
        if scheme.lower() != "bearer":
            # iOS 微信等 WKWebView 经常丢弃 Sec-WebSocket-Protocol；网页版在这类
            # 环境下改走 query access_token（不带子协议）。
            query_token = socket.query_params.get("access_token")
            if query_token:
                scheme, token = "bearer", query_token
        if scheme.lower() != "bearer":
            await reject_websocket(socket, 4401, "Authentication required", ws_subprotocol)
            return
        started = time.monotonic()
        device: str | None = None
        subject = None
        accepted = False
        try:
            device = device_id(token)
            subject = resolve_quota_subject(app.state.db, settings, device)
            if not limiter.allow(device):
                raise LecsyncError("Too many requests", status=429, code="RESOURCE_LIMIT")
            await streams.acquire(device)
        except AccountError as account_error:
            reasons = {
                "account_required": "需要激活试用额度",
                "account_expired": "额度已到期",
                "account_disabled": "账号已停用",
            }
            await reject_websocket(socket, 4403, reasons.get(account_error.code, "试用额度不可用"), ws_subprotocol)
            return
        except (HTTPException, LecsyncError) as auth_error:
            await reject_websocket(
                socket,
                4401 if isinstance(auth_error, HTTPException) else 4429,
                "Authentication required" if isinstance(auth_error, HTTPException) else "Too many requests",
                ws_subprotocol,
            )
            return
        await socket.accept(subprotocol=ws_subprotocol)
        accepted = True
        request_started = started
        started = time.monotonic()
        last_audio = started
        upstream: LecsyncRealtimeConnection | None = None
        try:
            first = await asyncio.wait_for(socket.receive_text(), timeout=15)
            message = json.loads(first)
            if kind == "realtime":
                config = RealtimeConfig.model_validate(message.get("config")).model_dump(exclude_none=True)
            else:
                config = VoiceTypingOptions.model_validate(message.get("config", {})).model_dump(exclude_none=True)
            upstream_context = app.state.lecsync_connection_factory(client(), kind, config)
            upstream = await upstream_context.__aenter__()
            session_id = upstream.session_id or uuid.uuid4().hex
            app.state.db.create_lecsync_task(device, session_id, kind, reserved_seconds=0)
            audio_queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=40)
            sent_seconds = 0.0

            async def downstream():
                nonlocal sent_seconds
                async for event in upstream.events():
                    if event.get("type") == "usage.update":
                        effective = float(event.get("effectiveSeconds", 0))
                        app.state.db.settle_lecsync_task_audio(device, session_id, effective, subject.limits.audio_seconds)
                        app.state.db.update_lecsync_task(device, session_id, status="processing", actual_seconds=effective, usage=event)
                    elif event.get("type") in {"session.ended", "result", "error"}:
                        actual = audio_seconds(event, sent_seconds)
                        app.state.db.settle_lecsync_task_audio(device, session_id, actual, subject.limits.audio_seconds)
                        app.state.db.update_lecsync_task(device, session_id, status="succeeded" if event["type"] != "error" else "failed", actual_seconds=actual, usage=event.get("usage") if isinstance(event.get("usage"), dict) else {})
                    await socket.send_json(event)
                    if event.get("type") in {"session.ended", "result", "error"}:
                        await socket.close()
                        return

            async def send_audio():
                nonlocal sent_seconds
                while True:
                    audio = await audio_queue.get()
                    try:
                        await upstream.send_audio(audio)
                        sent_seconds += len(audio) / 32000
                    finally:
                        audio_queue.task_done()

            async def upload_audio():
                nonlocal last_audio
                while True:
                    timeout = max(0.1, 60 - (time.monotonic() - last_audio))
                    try:
                        message = await asyncio.wait_for(socket.receive(), timeout=timeout)
                    except TimeoutError:
                        await socket.send_json({"type": "session.error", "code": "IDLE_TIMEOUT", "message": "暂停时间过长，请重新连接", "retryable": True})
                        await socket.close(code=4013)
                        return
                    if message["type"] == "websocket.disconnect":
                        return
                    if message.get("bytes") is not None:
                        if time.monotonic() - started > 14400:
                            # Official max-duration close code: the client opens a new stream.
                            await socket.close(code=4012, reason="Please start a new class")
                            return
                        if audio_queue.full():
                            audio_queue.get_nowait()
                            audio_queue.task_done()
                        audio_queue.put_nowait(message["bytes"])
                        last_audio = time.monotonic()
                    elif message.get("text"):
                        control = json.loads(message["text"])
                        if control.get("type") in {"session.stop", "end"}:
                            await asyncio.wait_for(audio_queue.join(), timeout=2)
                        await upstream.control(control)

            sender_task = asyncio.create_task(send_audio())
            receive_task = asyncio.create_task(upload_audio())
            send_task = asyncio.create_task(downstream())
            done, pending = await asyncio.wait({receive_task, send_task, sender_task}, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            for task in done:
                task.result()
        except WebSocketDisconnect:
            pass
        except QuotaExceeded:
            await socket.send_json({"type": "session.error", "code": "AUDIO_QUOTA_EXCEEDED", "message": "今日云端音频额度已用完", "retryable": False})
        except (ValidationError, ValueError, json.JSONDecodeError):
            await socket.send_json({"type": "session.error", "code": "INVALID_INPUT", "message": "云端听课设置不正确", "retryable": False})
        except LecsyncError as exc:
            await socket.send_json({"type": "session.error", "code": exc.code, "message": "云端服务暂时不可用，请稍后重试", "retryable": exc.status in {429, 500, 502, 503, 504}})
        except (HTTPException, ProviderConfigurationError):
            await socket.send_json({"type": "session.error", "code": "NOT_CONFIGURED", "message": "云端学习服务尚未配置", "retryable": False})
        finally:
            if upstream is not None:
                await upstream.__aexit__(None, None, None)
            await streams.release(device)
            if accepted and device is not None:
                try:
                    app.state.db.record_api_request(
                        device_id=device,
                        account_id=None if subject is None else subject.account_id,
                        method="WS",
                        route="/v2/lecsync/realtime" if kind == "realtime" else "/v2/lecsync/voice-typing/ws",
                        status=101,
                        duration_ms=int((time.monotonic() - request_started) * 1000),
                    )
                except Exception:
                    pass

    @app.websocket("/v2/lecsync/realtime")
    async def realtime(socket: WebSocket):
        await proxy_socket(socket, "realtime")

    @app.websocket("/v2/lecsync/voice-typing/ws")
    async def voice_typing_socket(socket: WebSocket):
        await proxy_socket(socket, "voicetyping")

    @app.get("/v2/lecsync/recordings/{session_id}")
    async def recording(session_id: str, device: str = Depends(authenticated)):
        if app.state.db.own_lecsync_task(device, session_id) is None:
            raise HTTPException(404, {"code": "NOT_FOUND", "message": "找不到该录音"})
        return normalize(await call(client().recording, session_id))

    @app.delete("/v2/lecsync/recordings/{session_id}")
    async def delete_recording(session_id: str, device: str = Depends(authenticated)):
        if app.state.db.own_lecsync_task(device, session_id) is None:
            raise HTTPException(404, {"code": "NOT_FOUND", "message": "找不到该录音"})
        await call(client().delete_recording, session_id)
        app.state.db.update_lecsync_task(device, session_id, status="deleted")
        return {"deleted": True}

    @app.get("/v2/lecsync/recordings/{session_id}/{kind}")
    async def recording_file(session_id: str, kind: str, device: str = Depends(authenticated)):
        if app.state.db.own_lecsync_task(device, session_id) is None or kind not in {"audio", "transcript"}:
            raise HTTPException(404, {"code": "NOT_FOUND", "message": "找不到该文件"})
        metadata = await call(client().recording, session_id)
        url = metadata.get("audioUrl" if kind == "audio" else "transcriptUrl")
        if not url:
            raise HTTPException(404, {"code": "NOT_FOUND", "message": "文件尚未准备好"})
        content, mime = await call(client().recording_download, url)
        return Response(content, media_type=mime)

    @app.post("/admin/lecsync/webhooks")
    async def create_webhook(payload: dict, x_admin_token: str | None = Header(default=None)):
        from .lecsync_webhooks import admin_authorized, encrypt_webhook_secret
        if not admin_authorized(x_admin_token, os.getenv("LECSYNC_ADMIN_TOKEN")):
            raise HTTPException(404, "Not found")
        if not settings.token_pepper:
            raise HTTPException(503, "Webhook encryption is not configured")
        url = payload.get("url")
        if not isinstance(url, str):
            raise HTTPException(422, "A public HTTPS callback URL is required")
        result = await call(client().create_webhook, url, client().key_for("webhook-create", payload))
        webhook_id = result.get("id") or result.get("webhook_id")
        secret = result.get("secret")
        version = str(result.get("secret_version") or result.get("version") or "1")
        if not isinstance(webhook_id, str) or not isinstance(secret, str):
            raise HTTPException(502, "Webhook registration did not return a secret")
        app.state.db.save_webhook_secret(webhook_id, version, encrypt_webhook_secret(secret, settings.token_pepper))
        return {"webhookId": webhook_id, "secretVersion": version, "registered": True}

    @app.get("/admin/lecsync/webhooks/{webhook_id}/deliveries")
    async def webhook_deliveries(webhook_id: str, x_admin_token: str | None = Header(default=None)):
        from .lecsync_webhooks import admin_authorized
        if not admin_authorized(x_admin_token, os.getenv("LECSYNC_ADMIN_TOKEN")):
            raise HTTPException(404, "Not found")
        return normalize(await call(client().webhook_deliveries, webhook_id))

    @app.post("/admin/lecsync/webhooks/deliveries/{delivery_id}/resend")
    async def resend_webhook(delivery_id: str, x_admin_token: str | None = Header(default=None)):
        from .lecsync_webhooks import admin_authorized
        if not admin_authorized(x_admin_token, os.getenv("LECSYNC_ADMIN_TOKEN")):
            raise HTTPException(404, "Not found")
        return normalize(await call(client().resend_webhook, delivery_id, client().key_for("webhook-resend", delivery_id)))

    @app.post("/admin/lecsync/webhooks/{webhook_id}/rotate-secret")
    async def rotate_webhook(webhook_id: str, x_admin_token: str | None = Header(default=None)):
        from .lecsync_webhooks import admin_authorized, encrypt_webhook_secret
        if not admin_authorized(x_admin_token, os.getenv("LECSYNC_ADMIN_TOKEN")):
            raise HTTPException(404, "Not found")
        result = await call(client().rotate_webhook_secret, webhook_id, client().key_for("webhook-rotate", [webhook_id, time.time_ns()]))
        secret = result.get("secret")
        version = str(result.get("secret_version") or result.get("version") or "1")
        if not settings.token_pepper or not isinstance(secret, str):
            raise HTTPException(502, "Webhook rotation did not return a secret")
        app.state.db.save_webhook_secret(webhook_id, version, encrypt_webhook_secret(secret, settings.token_pepper))
        return {"webhookId": webhook_id, "secretVersion": version, "rotated": True}

    @app.post("/v2/lecsync/webhooks/events")
    async def webhook_event(request: Request):
        # Webhook management stays server-side; devices never receive secrets.
        secrets = json.loads(os.getenv("LECSYNC_WEBHOOK_SECRETS", "{}"))
        body = await request.body()
        secret = secrets.get(request.headers.get("Lecsync-Secret-Version", "1"))
        if not secret and settings.token_pepper:
            from .lecsync_webhooks import decrypt_webhook_secret
            encrypted = app.state.db.webhook_secret(request.headers.get("Lecsync-Secret-Version", "1"))
            if encrypted:
                secret = decrypt_webhook_secret(encrypted, settings.token_pepper)
        if not isinstance(secret, str) or not secret:
            raise HTTPException(401, "Webhook secret is not configured")
        try:
            verify_webhook_signature(body, request.headers.get("Lecsync-Timestamp", ""), request.headers.get("Lecsync-Signature", ""), secret)
            payload = json.loads(body)
            event = payload.get("data", payload)
            job_id = event["job_id"]
            status = event["status"]
            if status not in {"succeeded", "failed", "cancelled"}:
                raise ValueError
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            raise HTTPException(400, "Invalid webhook event") from exc
        except LecsyncError as exc:
            raise HTTPException(401, "Webhook signature verification failed") from exc
        accepted = app.state.db.record_lecsync_webhook(request.headers.get("Lecsync-Event-Id", ""), job_id, status)
        return {"accepted": accepted}
