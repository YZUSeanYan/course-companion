import hashlib
import hmac
import json
import struct
import time

import httpx
import pytest

from app.config import Settings
from app.db import Database, QuotaExceeded
from app.lecsync import LecsyncClient, LecsyncError, verify_webhook_signature
from app.main import create_app
from conftest import auth_headers, make_client


def test_official_translation_result_wrapper_and_full_options(settings, monkeypatch):
    monkeypatch.setenv("LECSYNC_API_KEY", "test-only-lecsync")
    monkeypatch.setattr("app.lecsync.validate_provider_url", lambda url: url + "/chat/completions")
    calls = []

    def handler(request):
        calls.append(request)
        assert request.url.path == "/v1/translate"
        body = json.loads(request.content)
        assert body["context"] == "Manufacturing English"
        assert body["terms"] == [{"source": "lathe", "target": "车床"}]
        assert body["source_lang"] == "en"
        return httpx.Response(200, json={
            "request_id": "req-full", "status": "succeeded",
            "result": {"text": "车床", "model": "translate-default", "source_lang": "en", "unchanged": False},
            "usage": {"charge_cents": "0.001"}, "result_expires_at": "2026-10-31T00:00:00Z",
        })

    client = make_client(settings, lambda request: None)
    client.app.state.lecsync = LecsyncClient(transport=httpx.MockTransport(handler))
    response = client.post("/v2/lecsync/translate", headers=auth_headers(client), json={
        "sourceText": "lathe", "sourceLang": "en", "targetLang": "zh",
        "context": "Manufacturing English", "terms": [{"source": "lathe", "target": "车床"}],
    })
    if response.status_code != 200:
        raise AssertionError((response.text, calls[0].content if calls else "no upstream call"))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["result"]["text"] == "车床"
    assert body["usage"]["chargeCents"] == "0.001"
    assert len(calls) == 1


def test_gateway_verifies_hash_and_isolates_translation_cache(settings, monkeypatch):
    monkeypatch.setenv("LECSYNC_API_KEY", "test-only-lecsync")
    monkeypatch.setattr("app.lecsync.validate_provider_url", lambda url: url + "/chat/completions")
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"request_id": "req-cache-" + hashlib.sha256(request.headers["Idempotency-Key"].encode()).hexdigest()[:8], "status": "succeeded", "result": {"text": "译文", "model": "translate-default"}})

    client = make_client(settings, lambda request: None)
    client.app.state.lecsync = LecsyncClient(transport=httpx.MockTransport(handler))
    first_headers = auth_headers(client)
    payload = {"sourceText": "source", "targetLang": "zh", "sourceHash": "0" * 64}
    assert client.post("/v2/lecsync/translate", json=payload, headers=first_headers).status_code == 422
    payload["sourceHash"] = hashlib.sha256(b"source").hexdigest()
    assert client.post("/v2/lecsync/translate", json=payload, headers=first_headers).status_code == 200
    assert client.post("/v2/lecsync/translate", json=payload, headers=first_headers).status_code == 200
    assert len(calls) == 1
    assert client.post("/v2/lecsync/translate", json=payload, headers=auth_headers(client)).status_code == 200
    assert len(calls) == 2


def test_all_rest_endpoints_and_no_upload_secret(settings, monkeypatch):
    monkeypatch.setenv("LECSYNC_API_KEY", "test-only-lecsync")
    monkeypatch.setattr("app.lecsync.validate_provider_url", lambda url: url + "/chat/completions")
    calls = []

    def handler(request):
        calls.append((request.method, request.url.path))
        path = request.url.path
        if path == "/v1/models":
            return httpx.Response(200, json={"models": [{"id": "stt-sync-default", "languages": ["en", "zh"]}]})
        if path == "/v1/audio/transcriptions":
            return httpx.Response(200, json={"request_id": "req-audio", "status": "succeeded", "text": "Hello", "usage": {"audio_seconds": 1}, "segments": [{"text": "Hello", "start_ms": 0, "end_ms": 1000, "speaker": "speaker_0"}], "words": []})
        if path == "/v1/audio/uploads":
            return httpx.Response(200, json={"upload_id": "up-1", "upload_url": "https://1.1.1.1/upload", "headers": {"x-test": "ok"}})
        if path == "/upload":
            assert "authorization" not in request.headers
            return httpx.Response(200)
        if path == "/v1/audio/transcription-jobs" and request.method == "POST":
            body = json.loads(request.content)
            assert body["input"] == {"upload_id": "up-1"}
            return httpx.Response(202, json={"job_id": "job-1", "request_id": "req-job", "status": "accepted", "progress": 0, "usage": {}})
        if path == "/v1/audio/transcription-jobs/job-1/result":
            assert request.url.params["cursor"] == "0"
            return httpx.Response(200, json={"job_id": "job-1", "request_id": "req-job", "result": {"text": "Hello"}, "cursor": 0, "next_cursor": None, "page_count": 1})
        if path == "/v1/audio/transcription-jobs/job-1":
            return httpx.Response(200, json={"job_id": "job-1", "status": "succeeded", "progress": 100})
        if path == "/v1/audio/transcription-jobs/job-1/cancel":
            return httpx.Response(200, json={"job_id": "job-1", "status": "cancelled"})
        if path == "/v1/voicetyping":
            return httpx.Response(200, json={"request_id": "req-voice", "status": "succeeded", "raw": "hello", "text": "Hello.", "usedModel": True})
        return httpx.Response(200, json={"deleted": True})

    client = make_client(settings, lambda request: None)
    client.app.state.lecsync = LecsyncClient(transport=httpx.MockTransport(handler))
    headers = auth_headers(client)
    wav = b"RIFF" + struct.pack("<I", 36 + 32000) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, 16000, 32000, 2, 16) + b"data" + struct.pack("<I", 32000) + bytes(32000)
    assert client.get("/v2/lecsync/models", headers=headers).status_code == 200
    options = json.dumps({"timestamps": "word", "diarization": True, "hotwords": ["LecSync"]})
    response = client.post("/v2/lecsync/audio/transcriptions", headers=headers, files={"file": ("one.wav", wav, "audio/wav")}, data={"options": options})
    assert response.status_code == 200, response.text
    assert response.json()["segments"][0]["startMs"] == 0
    response = client.post("/v2/lecsync/audio/jobs", headers=headers, files={"file": ("one.wav", wav, "audio/wav")}, data={"options": options})
    assert response.status_code == 200, response.text
    assert response.json()["jobId"] == "job-1"
    assert client.get("/v2/lecsync/audio/jobs/job-1", headers=headers).status_code == 200
    assert client.get("/v2/lecsync/audio/jobs/job-1/result?cursor=0", headers=headers).status_code == 200
    assert client.post("/v2/lecsync/audio/jobs/job-1/cancel", headers=headers).status_code == 200
    response = client.post("/v2/lecsync/voice-typing", headers=headers, files={"file": ("one.wav", wav, "audio/wav")}, data={"options": json.dumps({"polish": True, "translateTo": "zh", "terms": [{"term": "hello", "value": "你好"}]})})
    assert response.status_code == 200, response.text
    assert response.json()["text"] == "Hello."
    assert client.delete("/v2/lecsync/audio/jobs/job-1", headers=headers).status_code == 200
    assert client.get("/v2/lecsync/audio/jobs/job-1", headers=auth_headers(client)).status_code == 404
    assert ("PUT", "/upload") in calls


def test_audio_duration_and_quota_do_not_call_provider(settings, monkeypatch):
    monkeypatch.setenv("LECSYNC_API_KEY", "test-only-lecsync")
    monkeypatch.setattr("app.lecsync.validate_provider_url", lambda url: url + "/chat/completions")
    calls = []
    client = make_client(settings, lambda request: None)
    client.app.state.lecsync = LecsyncClient(transport=httpx.MockTransport(lambda request: calls.append(request) or httpx.Response(200, json={})))
    wav = b"RIFF" + struct.pack("<I", 36 + 4_000_000) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, 16000, 32000, 2, 16) + b"data" + struct.pack("<I", 4_000_000) + bytes(4_000_000)
    response = client.post("/v2/lecsync/audio/transcriptions", headers=auth_headers(client), files={"file": ("long.wav", wav, "audio/wav")})
    assert response.status_code == 413
    assert not calls


def test_task_audio_settlement_is_idempotent(tmp_path):
    db = Database(str(tmp_path / "usage.db"))
    device = db.create_device("hash")
    db.reserve_lecsync_audio(device, 120, 3600)
    db.create_lecsync_task(device_id=device, task_id="job", kind="transcription", reserved_seconds=120)
    db.settle_lecsync_task_audio(device, "job", 1)
    db.settle_lecsync_task_audio(device, "job", 1)
    with db.connect() as connection:
        seconds = connection.execute("SELECT audio_seconds FROM lecsync_usage WHERE device_id = ?", (device,)).fetchone()[0]
    assert seconds == 1
    with pytest.raises(QuotaExceeded):
        db.reserve_lecsync_text(device, 10, 0)


def test_webhook_signature_and_deduplication(settings, monkeypatch):
    monkeypatch.setenv("LECSYNC_WEBHOOK_SECRETS", json.dumps({"v2": "test-webhook-secret"}))
    client = make_client(settings, lambda request: None)
    payload = json.dumps({"event": "transcription.succeeded", "data": {"job_id": "job-1", "status": "succeeded"}}).encode()
    timestamp = str(time.time())
    signature = "v1=" + hmac.new(b"test-webhook-secret", timestamp.encode() + b"." + payload, hashlib.sha256).hexdigest()
    headers = {"LecSync-Timestamp": timestamp, "LecSync-Signature": signature, "LecSync-Event-Id": "event-1", "LecSync-Secret-Version": "v2"}
    first = client.post("/v2/lecsync/webhooks/events", content=payload, headers=headers)
    second = client.post("/v2/lecsync/webhooks/events", content=payload, headers=headers)
    assert first.status_code == 200 and first.json()["accepted"]
    assert second.status_code == 200 and not second.json()["accepted"]
    assert client.post("/v2/lecsync/webhooks/events", content=payload, headers=headers | {"LecSync-Signature": "v1=bad"}).status_code == 401
