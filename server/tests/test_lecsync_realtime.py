import asyncio
import json
import tempfile

import pytest

from app.lecsync import LecsyncClient, LecsyncError
from app.lecsync_realtime import LecsyncRealtimeConnection, StreamLimiter
from conftest import auth_headers

TEST_DIRECTORIES = []
TEST_LECSYNC = "".join(("test", "only", "lecsync"))


class FakeSocket:
    def __init__(self, incoming):
        self.incoming = list(incoming)
        self.sent = []

    async def recv(self):
        if not self.incoming:
            raise RuntimeError("No more fake messages")
        return self.incoming.pop(0)

    async def send(self, value):
        self.sent.append(value)

    async def close(self):
        pass

    async def events(self):
        for event in self.incoming:
            yield json.loads(event)

    async def send_audio(self, audio):
        self.sent.append(audio)

    async def control(self, message):
        self.sent.append(message)


def make_settings():
    from app.config import Settings
    directory = tempfile.TemporaryDirectory()
    return Settings(database_path=directory.name + "/test.db", token_pepper="test-pepper", provider_base_url=None, provider_model=None, provider_api_key=None)


def test_realtime_forwards_all_official_event_families(monkeypatch):
    socket = FakeSocket([
        json.dumps({"type": "session.ready", "sessionId": "session-1", "audio": {}, "limits": {}, "store": False, "region": "us"}),
        json.dumps({"type": "transcript.partial", "text": "A lat", "paragraphs": [{"pieces": [{"text": "A lat", "confirmed": False}]}]}),
        json.dumps({"type": "transcript.final", "segmentId": "s1", "text": "A lathe", "startMs": 0, "endMs": 1000, "speaker": "speaker_0", "language": "en"}),
        json.dumps({"type": "translation.final", "segmentId": "s1", "text": "车床", "sourceText": "A lathe", "sourceLanguage": "en", "targetLanguage": "zh"}),
        json.dumps({"type": "translation.final", "segmentId": "s1", "text": "一台车床", "sourceText": "A lathe", "sourceLanguage": "en", "targetLanguage": "zh", "enhanced": True}),
        json.dumps({"type": "digest.update", "sections": [{"title": "Machines", "points": ["Lathes remove material"], "status": "pending", "startMs": 0, "endMs": 1000, "segmentIds": ["s1"]}]}),
        json.dumps({"type": "usage.update", "effectiveSeconds": 1.0, "discardedSeconds": 0, "accruedCents": 0.006}),
        json.dumps({"type": "session.pong"}),
        json.dumps({"type": "session.ended", "reason": "client_stop", "storage": {"status": "disabled"}, "billing": {"accruedCents": 0.006}}),
    ])
    events = []

    class Connection:
        def __init__(self, *args, **kwargs):
            self.session_id = "session-1"

        async def __aenter__(self):
            self.events = socket.events
            self.send_audio = socket.send_audio
            self.control = socket.control
            return self

        async def __aexit__(self, *args):
            return None

    async def run():
        from app.main import create_app
        from fastapi.testclient import TestClient
        import app.lecsync_realtime as realtime
        app = create_app(make_settings())
        app.state.lecsync = LecsyncClient(api_key=TEST_LECSYNC)
        app.state.lecsync_connection_factory = Connection
        with TestClient(app) as client:
            with client.websocket_connect("/v2/lecsync/realtime", headers=auth_headers(client)) as device:
                device.send_json({"type": "configure", "config": {
                    "transcribe": {"languages": ["en", "zh"], "strict": False, "identifyLanguage": True, "displayMode": "sentence", "speakers": True},
                    "translate": {"languages": ["en", "zh"]},
                    "glossary": {"terms": ["lathe"], "pairs": [{"source": "lathe", "target": "车床"}], "context": "Engineering"},
                    "aiEnhance": True, "digest": True, "store": False, "region": "us",
                }})
                while True:
                    event = device.receive_json()
                    events.append(event)
                    if event["type"] == "session.ended":
                        break
    asyncio.run(run())
    assert {event["type"] for event in events} == {"session.ready", "transcript.partial", "transcript.final", "translation.final", "digest.update", "usage.update", "session.pong", "session.ended"}
    assert sum(event["type"] == "translation.final" for event in events) == 2


def test_voice_typing_websocket_text_and_no_replay(monkeypatch):
    socket = FakeSocket([json.dumps({"type": "ready"}), json.dumps({"type": "result", "request_id": "req-voice", "text": "你好", "raw": "你好", "usedModel": True})])

    class Connection:
        def __init__(self, *args, **kwargs):
            self.session_id = "session-1"

        async def __aenter__(self):
            self.events = socket.events
            self.send_audio = socket.send_audio
            self.control = socket.control
            return self

        async def __aexit__(self, *args):
            return None

    async def run():
        from app.main import create_app
        from fastapi.testclient import TestClient
        import app.lecsync_realtime as realtime
        app = create_app(make_settings())
        app.state.lecsync = LecsyncClient(api_key=TEST_LECSYNC)
        app.state.lecsync_connection_factory = Connection
        with TestClient(app) as client:
            with client.websocket_connect("/v2/lecsync/voice-typing/ws", headers=auth_headers(client)) as device:
                device.send_json({"type": "configure", "config": {"polish": True, "translateTo": "zh", "terms": ["LecSync"]}})
                assert device.receive_json()["type"] == "ready"
                device.send_bytes(bytes(3200))
                device.send_json({"type": "end"})
                result = device.receive_json()
                assert result["text"] == "你好"
                assert result["usedModel"] is True
    asyncio.run(run())


def test_connection_validates_audio_and_concurrency():
    async def run():
        limiter = StreamLimiter(per_device=1, global_limit=1)
        await limiter.acquire("device")
        with pytest.raises(LecsyncError):
            await limiter.acquire("device")
        await limiter.release("device")
        connection = LecsyncRealtimeConnection(LecsyncClient(api_key=TEST_LECSYNC), "realtime", {})
        connection.socket = FakeSocket([])
        with pytest.raises(LecsyncError):
            await connection.send_audio(b"\x00")
        with pytest.raises(LecsyncError):
            await connection.control({"type": "session.start"})
    asyncio.run(run())
