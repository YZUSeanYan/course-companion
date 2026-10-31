from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import websockets

from .lecsync import LecsyncClient, LecsyncError, LecsyncInvalidResponse
from .provider import validate_provider_url
from urllib.parse import urlsplit


class LecsyncRealtimeConnection:
    """Owns an upstream socket without exposing its credentials to a device."""

    def __init__(self, client: LecsyncClient, kind: str, config: dict[str, Any]) -> None:
        self.client = client
        self.kind = kind
        self.config = config
        self.socket: Any = None
        self.session_id = ""

    async def __aenter__(self):
        if self.kind == "realtime":
            config = {"audio": {"encoding": "pcm_s16le", "sampleRate": 16000, "channels": 1}, **self.config}
            handshake = await self.client.realtime_connect(config)
            url = handshake.get("url")
            protocol = "lecsync.realtime.v1"
            token = handshake.get("token")
            self.session_id = str(handshake.get("sessionId", ""))
        else:
            handshake = await self.client.voice_typing_connect(self.config)
            url = handshake.get("websocket_url")
            protocol = handshake.get("protocol")
            token = handshake.get("ticket")
        if not isinstance(url, str) or not url.startswith("wss://") or not isinstance(protocol, str) or not isinstance(token, str):
            raise LecsyncInvalidResponse("Invalid upstream WebSocket handshake")
        parsed = urlsplit(url)
        if parsed.scheme != "wss" or not parsed.hostname:
            raise LecsyncInvalidResponse("Invalid upstream WebSocket handshake")
        await asyncio.to_thread(validate_provider_url, f"https://{parsed.netloc}{parsed.path}")
        try:
            self.socket = await websockets.connect(
                url,
                subprotocols=[protocol, token],
                max_size=2 * 1024 * 1024,
                ping_interval=None,
                close_timeout=5,
                open_timeout=self.client._timeout,
            )
        except (websockets.WebSocketException, OSError, asyncio.TimeoutError) as exc:
            raise LecsyncError("Upstream WebSocket connection failed", code="NETWORK_UNAVAILABLE") from exc
        return self

    async def __aexit__(self, *_):
        if self.socket is not None:
            await self.socket.close()

    async def events(self) -> AsyncIterator[dict]:
        import json
        while True:
            frame = await self.socket.recv()
            if isinstance(frame, bytes):
                raise LecsyncInvalidResponse("Unexpected upstream binary event")
            try:
                event = json.loads(frame)
            except ValueError:
                raise LecsyncInvalidResponse("Invalid upstream event") from None
            if not isinstance(event, dict) or not isinstance(event.get("type"), str):
                raise LecsyncInvalidResponse("Invalid upstream event envelope")
            if event["type"] in {"session.ended", "result", "error"}:
                yield event
                return
            yield event

    async def send_audio(self, audio: bytes) -> None:
        if not audio or len(audio) % 2 or len(audio) > 65536:
            raise LecsyncError("Audio frames must be nonempty, even-sized and at most 64 KiB", status=400, code="INVALID_AUDIO_FRAME")
        await self.socket.send(audio)

    async def control(self, message: dict) -> None:
        import json
        kind = self.kind
        allowed = {"session.finalize", "session.stop", "session.ping"} if kind == "realtime" else {"end"}
        if message.get("type") not in allowed:
            raise LecsyncError("Unsupported stream control message", status=400, code="INVALID_INPUT")
        await self.socket.send(json.dumps(message, separators=(",", ":")))


class StreamLimiter:
    def __init__(self, per_device: int, global_limit: int = 16) -> None:
        self.per_device = per_device
        self.global_limit = global_limit
        self._active: dict[str, int] = {}
        self._lock = asyncio.Lock()

    async def acquire(self, device_id: str) -> None:
        async with self._lock:
            if self._active.get(device_id, 0) >= self.per_device or sum(self._active.values()) >= self.global_limit:
                raise LecsyncError("Too many active streams", status=429, code="RESOURCE_LIMIT", retry_after=5)
            self._active[device_id] = self._active.get(device_id, 0) + 1

    async def release(self, device_id: str) -> None:
        async with self._lock:
            remaining = self._active.get(device_id, 0) - 1
            if remaining > 0:
                self._active[device_id] = remaining
            else:
                self._active.pop(device_id, None)
