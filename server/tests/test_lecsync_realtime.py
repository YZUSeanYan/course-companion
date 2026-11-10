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
                    device.send_json({"type": "session.finalize"})
                    while True:
                        event = device.receive_json()
                        events.append(event)
                        if event["type"] == "session.ended":
                            break
    asyncio.run(run())
    assert {event["type"] for event in events} == {"session.ready", "transcript.partial", "transcript.final", "translation.final", "digest.update", "usage.update", "session.pong", "session.ended"}
    assert sum(event["type"] == "translation.final" for event in events) == 2
    usage = next(event for event in events if event["type"] == "usage.update")
    assert usage["effectiveSeconds"] == 1.0 and usage["discardedSeconds"] == 0
    assert {"type": "session.finalize"} in socket.sent


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


def test_realtime_accepts_browser_subprotocol_auth(monkeypatch):
    """浏览器 WebSocket 无法设置 Authorization 头：允许 Sec-WebSocket-Protocol: bearer, <token>。"""
    socket = FakeSocket([json.dumps({"type": "session.ready", "sessionId": "session-web", "store": False})])
    events = []

    class Connection:
        def __init__(self, *args, **kwargs):
            self.session_id = "session-web"

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
        app = create_app(make_settings())
        app.state.lecsync = LecsyncClient(api_key=TEST_LECSYNC)
        app.state.lecsync_connection_factory = Connection
        with TestClient(app) as client:
            token = auth_headers(client)["Authorization"].split(" ", 1)[1]
            with client.websocket_connect(
                "/v2/lecsync/realtime",
                headers={"sec-websocket-protocol": f"bearer, {token}"},
            ) as device:
                device.send_json({"type": "configure", "config": {"transcribe": {"languages": ["en", "zh"]}}})
                events.append(device.receive_json())
    asyncio.run(run())
    assert events == [{"type": "session.ready", "sessionId": "session-web", "store": False}]


def _assert_websocket_close_code(client, path, headers=None, expected=4401):
    from fastapi import WebSocketDisconnect

    try:
        with client.websocket_connect(path, headers=headers or {}) as device:
            with pytest.raises(WebSocketDisconnect) as excinfo:
                device.receive_text()
            assert excinfo.value.code == expected
    except WebSocketDisconnect as exc:
        assert exc.code == expected


def test_realtime_rejects_malformed_subprotocol():
    """非 bearer,<token> 形式的子协议不能通过鉴权，连接以 4401 关闭。"""
    async def run():
        from app.main import create_app
        from fastapi.testclient import TestClient
        app = create_app(make_settings())
        app.state.lecsync = LecsyncClient(api_key=TEST_LECSYNC)
        with TestClient(app) as client:
            _assert_websocket_close_code(
                client,
                "/v2/lecsync/realtime",
                headers={"sec-websocket-protocol": "bearer"},
                expected=4401,
            )
    asyncio.run(run())


def _realtime_app():
    from app.main import create_app
    app = create_app(make_settings())
    app.state.lecsync = LecsyncClient(api_key=TEST_LECSYNC)
    return app


def _fake_connection(session_id: str, socket: FakeSocket):
    class Connection:
        def __init__(self, *args, **kwargs):
            self.session_id = session_id

        async def __aenter__(self):
            self.events = socket.events
            self.send_audio = socket.send_audio
            self.control = socket.control
            return self

        async def __aexit__(self, *args):
            return None

    return Connection


def test_realtime_accepts_query_ticket(monkeypatch):
    """iOS 微信等环境无法发送子协议：网页版用 60 秒一次性 ticket 通过 query 鉴权。"""
    socket = FakeSocket([json.dumps({"type": "session.ready", "sessionId": "session-ticket", "store": False})])
    events = []

    async def run():
        from fastapi.testclient import TestClient
        app = _realtime_app()
        app.state.lecsync_connection_factory = _fake_connection("session-ticket", socket)
        with TestClient(app) as client:
            headers = auth_headers(client)
            issued = client.post("/v2/lecsync/realtime/ticket", headers=headers)
            assert issued.status_code == 200, issued.text
            payload = issued.json()
            assert payload["expiresIn"] == 60
            ticket = payload["ticket"]
            assert ticket and ticket != headers["Authorization"].split(" ", 1)[1]
            with client.websocket_connect(f"/v2/lecsync/realtime?ticket={ticket}") as device:
                device.send_json({"type": "configure", "config": {"transcribe": {"languages": ["en", "zh"]}}})
                events.append(device.receive_json())
            with app.state.db.connect() as connection:
                stored = [
                    row["ticket_hash"]
                    for row in connection.execute("SELECT ticket_hash FROM ws_tickets").fetchall()
                ]
            # 数据库只保存摘要，不保存 ticket 明文。
            assert stored and ticket not in stored
    asyncio.run(run())
    assert events == [{"type": "session.ready", "sessionId": "session-ticket", "store": False}]


def test_realtime_ticket_is_single_use(monkeypatch):
    """ticket 用一次即失效，被日志或历史记录回放也不能再次建连。"""
    socket = FakeSocket([json.dumps({"type": "session.ready", "sessionId": "session-once", "store": False})])

    async def run():
        from fastapi.testclient import TestClient
        app = _realtime_app()
        app.state.lecsync_connection_factory = _fake_connection("session-once", socket)
        with TestClient(app) as client:
            ticket = client.post(
                "/v2/lecsync/realtime/ticket", headers=auth_headers(client)
            ).json()["ticket"]
            with client.websocket_connect(f"/v2/lecsync/realtime?ticket={ticket}") as device:
                device.send_json({"type": "configure", "config": {"transcribe": {"languages": ["en"]}}})
                assert device.receive_json()["sessionId"] == "session-once"
            _assert_websocket_close_code(
                client, f"/v2/lecsync/realtime?ticket={ticket}", expected=4401
            )
    asyncio.run(run())


def test_realtime_rejects_expired_ticket():
    async def run():
        from fastapi.testclient import TestClient
        app = _realtime_app()
        with TestClient(app) as client:
            ticket = client.post(
                "/v2/lecsync/realtime/ticket", headers=auth_headers(client)
            ).json()["ticket"]
            with app.state.db.connect() as connection:
                connection.execute(
                    "UPDATE ws_tickets SET expires_at = ?", ("2000-01-01T00:00:00+00:00",)
                )
            _assert_websocket_close_code(
                client, f"/v2/lecsync/realtime?ticket={ticket}", expected=4401
            )
    asyncio.run(run())


def test_realtime_rejects_long_lived_device_token_in_query():
    """长期设备 token 不能放进 URL：否则会永久留在 Uvicorn/nginx 访问日志里。"""
    async def run():
        from fastapi.testclient import TestClient
        app = _realtime_app()
        with TestClient(app) as client:
            token = auth_headers(client)["Authorization"].split(" ", 1)[1]
            _assert_websocket_close_code(
                client, f"/v2/lecsync/realtime?access_token={token}", expected=4401
            )
    asyncio.run(run())


def test_realtime_ticket_requires_bearer_token():
    async def run():
        from fastapi.testclient import TestClient
        app = _realtime_app()
        with TestClient(app) as client:
            assert client.post("/v2/lecsync/realtime/ticket").status_code == 401
    asyncio.run(run())


def test_realtime_rejects_missing_auth_with_close_code():
    """无 Authorization、无子协议、无 query token 时以 4401 关闭（先 accept 再 close）。"""
    async def run():
        from app.main import create_app
        from fastapi.testclient import TestClient
        app = create_app(make_settings())
        app.state.lecsync = LecsyncClient(api_key=TEST_LECSYNC)
        with TestClient(app) as client:
            _assert_websocket_close_code(client, "/v2/lecsync/realtime", expected=4401)
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
