import hashlib
import hmac
import json
import time

import httpx

from app.lecsync import LecsyncClient
from app.lecsync_webhooks import decrypt_webhook_secret, encrypt_webhook_secret
from conftest import auth_headers, make_client


def test_pending_translation_can_be_recovered_by_owner(settings, monkeypatch):
    monkeypatch.setenv("LECSYNC_API_KEY", "test-only-lecsync")
    monkeypatch.setattr("app.lecsync.validate_provider_url", lambda url: url + "/chat/completions")

    def handler(request):
        if request.url.path == "/v1/translate":
            return httpx.Response(202, json={"request_id": "req-pending", "status": "accepted"})
        return httpx.Response(200, json={
            "request_id": "req-pending", "status": "succeeded",
            "result": {"text": "车床", "model": "translate-default"},
        })

    client = make_client(settings, lambda request: None)
    client.app.state.lecsync = LecsyncClient(transport=httpx.MockTransport(handler))
    headers = auth_headers(client)
    response = client.post("/v2/lecsync/translate", headers=headers, json={"sourceText": "lathe", "targetLang": "zh"})
    assert response.status_code == 200
    assert response.json()["status"] == "accepted"
    recovered = client.get("/v2/lecsync/requests/req-pending", headers=headers)
    assert recovered.status_code == 200
    assert recovered.json()["result"]["text"] == "车床"
    assert client.get("/v2/lecsync/requests/req-pending", headers=auth_headers(client)).status_code == 404


def test_webhook_admin_encrypts_secret_and_receives_rotation(settings, monkeypatch):
    monkeypatch.setenv("LECSYNC_API_KEY", "test-only-lecsync")
    monkeypatch.setenv("LECSYNC_ADMIN_TOKEN", "test-admin-credential")
    monkeypatch.setattr("app.lecsync.validate_provider_url", lambda url: url + "/chat/completions")

    def handler(request):
        if request.url.path == "/v1/webhooks" and request.method == "POST":
            return httpx.Response(200, json={"id": "hook-1", "secret": "test-webhook-plaintext", "secret_version": "v1"})
        if request.url.path.endswith("/rotate-secret"):
            return httpx.Response(200, json={"secret": "test-rotated-plaintext", "secret_version": "v2"})
        if request.url.path.endswith("/deliveries"):
            return httpx.Response(200, json={"deliveries": [{"id": "delivery-1", "status": "failed"}]})
        return httpx.Response(200, json={"resent": True})

    client = make_client(settings, lambda request: None)
    client.app.state.lecsync = LecsyncClient(transport=httpx.MockTransport(handler))
    headers = {"X-Admin-Token": "test-admin-credential"}
    assert client.post("/admin/lecsync/webhooks", json={"url": "https://1.1.1.1/callback"}, headers=auth_headers(client)).status_code == 404
    created = client.post("/admin/lecsync/webhooks", json={"url": "https://1.1.1.1/callback"}, headers=headers)
    assert created.status_code == 200, created.text
    assert "secret" not in created.json() and "plaintext" not in created.text
    rotated = client.post("/admin/lecsync/webhooks/hook-1/rotate-secret", headers=headers)
    assert rotated.status_code == 200
    assert "plaintext" not in rotated.text
    assert client.get("/admin/lecsync/webhooks/hook-1/deliveries", headers=headers).status_code == 200
    assert client.post("/admin/lecsync/webhooks/deliveries/delivery-1/resend", headers=headers).status_code == 200

    with client.app.state.db.connect() as connection:
        encrypted = connection.execute("SELECT ciphertext FROM lecsync_webhook_secrets WHERE secret_version = 'v2'").fetchone()[0]
    assert "test-rotated-plaintext" not in encrypted
    assert decrypt_webhook_secret(encrypted, settings.token_pepper) == "test-rotated-plaintext"
    payload = json.dumps({"data": {"job_id": "job-1", "status": "succeeded"}}).encode()
    timestamp = str(time.time())
    signature = "v1=" + hmac.new(b"test-rotated-plaintext", timestamp.encode() + b"." + payload, hashlib.sha256).hexdigest()
    event = client.post("/v2/lecsync/webhooks/events", content=payload, headers={
        "Lecsync-Timestamp": timestamp, "Lecsync-Signature": signature,
        "Lecsync-Event-Id": "event-rotate", "Lecsync-Secret-Version": "v2",
    })
    assert event.status_code == 200


def test_public_audio_url_rejects_private_target(settings):
    client = make_client(settings, lambda request: None)
    response = client.post("/v2/lecsync/audio/jobs/url", headers=auth_headers(client), json={"fileUrl": "http://127.0.0.1/audio.wav", "options": {}})
    assert response.status_code == 422


def test_upstream_unauthorized_is_not_device_unauthorized(settings, monkeypatch):
    monkeypatch.setenv("LECSYNC_API_KEY", "test-only-lecsync")
    monkeypatch.setattr("app.lecsync.validate_provider_url", lambda url: url + "/chat/completions")
    client = make_client(settings, lambda request: None)
    client.app.state.lecsync = LecsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(401, json={"error": "UNAUTHORIZED", "request_id": "req-auth"})))
    response = client.post("/v2/lecsync/translate", headers=auth_headers(client), json={"sourceText": "lathe", "targetLang": "zh"})
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "UPSTREAM_UNAUTHORIZED"


def test_repeated_task_is_idempotent_and_owner_bound(tmp_path):
    from app.db import Database
    import pytest
    db = Database(str(tmp_path / "tasks.db"))
    first = db.create_device("first")
    second = db.create_device("second")
    db.create_lecsync_task(first, "shared-id", "translation")
    db.create_lecsync_task(first, "shared-id", "translation")
    assert db.own_lecsync_task(first, "shared-id") is not None
    with pytest.raises(PermissionError):
        db.create_lecsync_task(second, "shared-id", "translation")
