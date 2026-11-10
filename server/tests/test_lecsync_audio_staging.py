import json
import struct
from pathlib import Path

import httpx

from app.lecsync import LecsyncClient
from conftest import auth_headers, make_client


def _tiny_wav() -> bytes:
    return (
        b"RIFF"
        + struct.pack("<I", 36 + 32000)
        + b"WAVEfmt "
        + struct.pack("<IHHIIHH", 16, 1, 1, 16000, 32000, 2, 16)
        + b"data"
        + struct.pack("<I", 32000)
        + bytes(32000)
    )


def _staging_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return [path for path in root.rglob("*") if path.is_file()]


def _post_job(client, headers, wav: bytes):
    return client.post(
        "/v2/lecsync/audio/jobs",
        headers=headers,
        files={"file": ("one.wav", wav, "audio/wav")},
        data={"options": json.dumps({"timestamps": "word"})},
    )


def test_create_job_does_not_leave_staging_file_on_success(settings, monkeypatch, tmp_path):
    upload_root = tmp_path / "lecsync_uploads"
    upload_root.mkdir()
    monkeypatch.setenv("LECSYNC_API_KEY", "test-only-lecsync")
    monkeypatch.setenv("LECSYNC_UPLOAD_ROOT", str(upload_root))
    monkeypatch.setattr("app.lecsync.validate_provider_url", lambda url: url + "/chat/completions")

    def handler(request):
        path = request.url.path
        if path == "/v1/audio/uploads":
            return httpx.Response(
                200,
                json={
                    "upload_id": "up-1",
                    "upload_url": "https://1.1.1.1/upload",
                    "headers": {"x-test": "ok"},
                },
            )
        if path == "/upload":
            return httpx.Response(200)
        if path == "/v1/audio/transcription-jobs" and request.method == "POST":
            return httpx.Response(
                202,
                json={
                    "job_id": "job-ok",
                    "request_id": "req-job",
                    "status": "accepted",
                    "progress": 0,
                    "usage": {},
                },
            )
        return httpx.Response(404, json={"code": "NOT_FOUND"})

    client = make_client(settings, lambda request: None)
    client.app.state.lecsync = LecsyncClient(transport=httpx.MockTransport(handler))
    response = _post_job(client, auth_headers(client), _tiny_wav())
    assert response.status_code == 200, response.text
    assert response.json()["jobId"] == "job-ok"
    assert _staging_files(upload_root) == []


def test_create_job_does_not_leave_staging_file_on_provider_error(settings, monkeypatch, tmp_path):
    upload_root = tmp_path / "lecsync_uploads"
    leftover = upload_root / "should-not-be-touched.txt"
    upload_root.mkdir()
    leftover.write_text("manual-note", encoding="utf-8")
    monkeypatch.setenv("LECSYNC_API_KEY", "test-only-lecsync")
    monkeypatch.setenv("LECSYNC_UPLOAD_ROOT", str(upload_root))
    monkeypatch.setattr("app.lecsync.validate_provider_url", lambda url: url + "/chat/completions")

    def handler(request):
        return httpx.Response(502, json={"code": "UPSTREAM_INVALID", "message": "boom"})

    client = make_client(settings, lambda request: None)
    client.app.state.lecsync = LecsyncClient(transport=httpx.MockTransport(handler))
    response = _post_job(client, auth_headers(client), _tiny_wav())
    assert response.status_code >= 400
    remaining = _staging_files(upload_root)
    assert remaining == [leftover]
    assert leftover.read_text(encoding="utf-8") == "manual-note"
