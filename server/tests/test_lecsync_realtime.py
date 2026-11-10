import asyncio
import json
import tempfile
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from threading import Barrier, Event

import pytest
from fastapi.testclient import TestClient

from app.db import Database
from app.lecsync import LecsyncClient, LecsyncError
from app.lecsync_realtime import LecsyncRealtimeConnection, StreamLimiter
from app.main import create_app
from app.security import token_digest
from conftest import auth_headers, register

TEST_DIRECTORIES = []
TEST_LECSYNC = "".join(("test", "only", "lecsync"))


@pytest.fixture
def ticket_client(settings):
    app = create_app(settings)

    def unexpected_upstream(*args, **kwargs):
        pytest.fail("Ticket authentication must not open an upstream connection")

    app.state.lecsync = LecsyncClient(api_key=TEST_LECSYNC)
    app.state.lecsync_connection_factory = unexpected_upstream
    with TestClient(app) as client:
        yield client


@pytest.fixture
def ticket_db(tmp_path):
    return Database(str(tmp_path / "tickets.db"))


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
            # Fail promptly if authentication unexpectedly succeeds, without
            # opening a real upstream connection with a valid configuration.
            device.send_json({"type": "configure", "config": []})
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
            assert issued.headers["Cache-Control"] == "no-store"
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


@pytest.mark.parametrize("authorization", [None, "Basic invalid", "Bearer", "Bearer ", "Bearer invalid"])
def test_realtime_ticket_requires_bearer_token(ticket_client, authorization):
    headers = {} if authorization is None else {"Authorization": authorization}
    response = ticket_client.post("/v2/lecsync/realtime/ticket", headers=headers)
    assert response.status_code == 401
    with ticket_client.app.state.db.connect() as connection:
        assert connection.execute("SELECT COUNT(*) FROM ws_tickets").fetchone()[0] == 0


@pytest.mark.parametrize("state", ["unactivated", "disabled", "expired"])
def test_realtime_ticket_requires_active_account(ticket_client, state):
    registered = register(ticket_client, activate=state != "unactivated")
    db = ticket_client.app.state.db
    if state == "disabled":
        db.update_account(registered["accountId"], {"status": "disabled"})
    elif state == "expired":
        db.update_account(registered["accountId"], {"valid_until": "2000-01-01"})
    response = ticket_client.post(
        "/v2/lecsync/realtime/ticket",
        headers={"Authorization": f"Bearer {registered['token']}"},
    )
    code = "account_required" if state == "unactivated" else f"account_{state}"
    assert response.status_code == 403
    assert response.headers["X-Zhixi-Error-Code"] == code
    assert response.json()["detail"]["code"] == code.upper()
    with db.connect() as connection:
        assert connection.execute("SELECT COUNT(*) FROM ws_tickets").fetchone()[0] == 0


@pytest.mark.parametrize("same_device", [True, False], ids=["device", "global"])
def test_realtime_ticket_rate_limit(settings, same_device):
    with TestClient(create_app(replace(settings, lecsync_rate_limit=1))) as client:
        headers = auth_headers(client)
        assert client.post("/v2/lecsync/realtime/ticket", headers=headers).status_code == 200
        if not same_device:
            headers = auth_headers(client)
        response = client.post("/v2/lecsync/realtime/ticket", headers=headers)
        assert response.status_code == 429
        assert response.json()["detail"]["code"] == "RESOURCE_LIMIT"
        assert response.json()["detail"]["retryAfter"] == 5
        with client.app.state.db.connect() as connection:
            assert connection.execute("SELECT COUNT(*) FROM ws_tickets").fetchone()[0] == 1


@pytest.mark.parametrize("path", ["/v2/lecsync/realtime", "/v2/lecsync/voice-typing/ws"])
@pytest.mark.parametrize("credential", ["invalid", "device_token"])
def test_websocket_rejects_invalid_ticket(ticket_client, path, credential):
    ticket = "invalid-ticket"
    if credential == "device_token":
        ticket = auth_headers(ticket_client)["Authorization"].split(" ", 1)[1]
    _assert_websocket_close_code(ticket_client, f"{path}?ticket={ticket}")


@pytest.mark.parametrize("path", ["/v2/lecsync/realtime", "/v2/lecsync/voice-typing/ws"])
@pytest.mark.parametrize("credential", ["header", "subprotocol", "ticket"])
@pytest.mark.parametrize("empty_access_token", [False, True])
def test_websocket_rejects_access_token_with_valid_auth(
    ticket_client, path, credential, empty_access_token
):
    headers = auth_headers(ticket_client)
    token = headers["Authorization"].split(" ", 1)[1]
    ticket = ticket_client.post("/v2/lecsync/realtime/ticket", headers=headers).json()["ticket"]
    query = "access_token=" + ("" if empty_access_token else token)
    if credential == "subprotocol":
        headers = {"sec-websocket-protocol": f"bearer, {token}"}
    elif credential == "ticket":
        headers = {}
        query += f"&ticket={ticket}"
    _assert_websocket_close_code(ticket_client, f"{path}?{query}", headers=headers)
    # Rejection precedes ticket consumption even if a valid ticket was supplied.
    db = ticket_client.app.state.db
    digest = token_digest(ticket, ticket_client.app.state.settings.token_pepper)
    assert db.consume_ws_ticket(digest)[0] == "ok"


@pytest.mark.parametrize("path", ["/v2/lecsync/realtime", "/v2/lecsync/voice-typing/ws"])
@pytest.mark.parametrize("state", ["disabled", "expired", "unbound", "deleted"])
def test_websocket_ticket_revalidates_account_and_device(ticket_client, path, state):
    registered = register(ticket_client)
    db = ticket_client.app.state.db
    headers = {"Authorization": f"Bearer {registered['token']}"}
    issued = ticket_client.post("/v2/lecsync/realtime/ticket", headers=headers)
    assert issued.status_code == 200
    ticket = issued.json()["ticket"]
    if state == "disabled":
        db.update_account(registered["accountId"], {"status": "disabled"})
    elif state == "expired":
        db.update_account(registered["accountId"], {"valid_until": "2000-01-01"})
    else:
        assert db.unbind_device(registered["accountId"], registered["deviceId"])
        if state == "deleted":
            assert db.delete_unbound_device(registered["deviceId"])
    expected = 4401 if state == "deleted" else 4403
    _assert_websocket_close_code(ticket_client, f"{path}?ticket={ticket}", expected=expected)
    _assert_websocket_close_code(ticket_client, path, headers=headers, expected=expected)
    digest = token_digest(ticket, ticket_client.app.state.settings.token_pepper)
    outcome = "not_found" if state == "deleted" else "consumed"
    assert db.consume_ws_ticket(digest) == (outcome, None)


@pytest.mark.parametrize("offset_seconds, outcome", [(-1, "ok"), (0, "expired"), (1, "expired")])
def test_ws_ticket_expiry_boundary(ticket_db, monkeypatch, offset_seconds, outcome):
    device = ticket_db.create_device("test-device-hash")
    ticket_db.create_ws_ticket(device, "test-ticket-hash")
    with ticket_db.connect() as connection:
        row = connection.execute("SELECT * FROM ws_tickets").fetchone()
    expires = datetime.fromisoformat(row["expires_at"])
    assert (expires - datetime.fromisoformat(row["created_at"])).total_seconds() == 60
    now = expires + timedelta(seconds=offset_seconds)
    monkeypatch.setattr(ticket_db, "_now", lambda: now.isoformat())
    assert ticket_db.consume_ws_ticket("test-ticket-hash") == (
        outcome, device if outcome == "ok" else None
    )


def test_ws_ticket_concurrent_consumption_has_one_winner(ticket_db):
    device = ticket_db.create_device("test-device-hash")
    ticket_db.create_ws_ticket(device, "test-ticket-hash")
    barrier = Barrier(8)

    def consume():
        barrier.wait(timeout=10)
        return ticket_db.consume_ws_ticket("test-ticket-hash")

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(consume) for _ in range(8)]
        outcomes = [future.result(timeout=10) for future in futures]
    assert outcomes.count(("ok", device)) == 1
    assert outcomes.count(("consumed", None)) == 7


def test_ws_ticket_expiry_is_checked_after_waiting_for_write_lock(ticket_db, monkeypatch):
    device = ticket_db.create_device("test-device-hash")
    ticket_db.create_ws_ticket(device, "test-ticket-hash")
    with ticket_db.connect() as connection:
        expires = datetime.fromisoformat(
            connection.execute("SELECT expires_at FROM ws_tickets").fetchone()[0]
        )
    now = expires - timedelta(seconds=1)
    monkeypatch.setattr(ticket_db, "_now", lambda: now.isoformat())
    waiting = Event()
    connect = ticket_db.connect
    blocker = connect()
    blocker.execute("BEGIN IMMEDIATE")

    def traced_connect():
        connection = connect()
        connection.set_trace_callback(
            lambda statement: waiting.set() if statement == "BEGIN IMMEDIATE" else None
        )
        return connection

    monkeypatch.setattr(ticket_db, "connect", traced_connect)
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(ticket_db.consume_ws_ticket, "test-ticket-hash")
        try:
            assert waiting.wait(timeout=5)
            now = expires
        finally:
            blocker.rollback()
            blocker.close()
        assert future.result(timeout=10) == ("expired", None)
    with connect() as connection:
        assert connection.execute("SELECT consumed_at FROM ws_tickets").fetchone()[0] is None


@pytest.mark.parametrize("cleanup", ["purge", "metrics", "issue"])
def test_ws_ticket_ttl_cleanup_preserves_live_tickets(ticket_db, monkeypatch, cleanup):
    device = ticket_db.create_device("test-device-hash")
    hashes = ["expired", "boundary", "consumed", "live"]
    for ticket_hash in hashes:
        ticket_db.create_ws_ticket(device, ticket_hash)
    now = datetime.now(timezone.utc)
    monkeypatch.setattr(ticket_db, "_now", lambda: now.isoformat())
    with ticket_db.connect() as connection:
        connection.execute(
            "UPDATE ws_tickets SET expires_at = ? WHERE ticket_hash = 'expired'",
            ((now - timedelta(seconds=1)).isoformat(),),
        )
        connection.execute(
            "UPDATE ws_tickets SET expires_at = ? WHERE ticket_hash = 'boundary'",
            (now.isoformat(),),
        )
    assert ticket_db.consume_ws_ticket("consumed") == ("ok", device)
    if cleanup == "purge":
        assert ticket_db.purge_ws_tickets() == 3
    elif cleanup == "metrics":
        assert ticket_db.cleanup_old_metrics()["wsTickets"] == 3
    else:
        ticket_db.create_ws_ticket(device, "new")
    with ticket_db.connect() as connection:
        remaining = {row[0] for row in connection.execute("SELECT ticket_hash FROM ws_tickets")}
    assert remaining == ({"live", "new"} if cleanup == "issue" else {"live"})
    for ticket_hash in ("expired", "boundary", "consumed"):
        assert ticket_db.consume_ws_ticket(ticket_hash) == ("not_found", None)
    assert ticket_db.consume_ws_ticket("live") == ("ok", device)


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
