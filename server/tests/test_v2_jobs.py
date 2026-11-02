import asyncio
import time
from contextlib import contextmanager
from dataclasses import replace

import httpx
from fastapi.testclient import TestClient

from app.learning_jobs import canonical_learning_pack_sha256
from app.main import create_app
from app.v2_provider import V2Provider
from app.v2_schemas import LearningPackRequest
from conftest import auth_headers, chat_response, make_client, register


def learning_package(source_id="page-1"):
    return {
        "minutes": {
            "title": "Synthetic classroom minutes",
            "overview": "The class discussed a controlled engineering example.",
            "sections": [
                {
                    "sectionKey": "concept",
                    "title": "Concept",
                    "body": "A grounded explanation from the synthetic source.",
                    "order": 0,
                    "sourceIds": [source_id],
                }
            ],
        },
        "doubtAnswers": [],
        "visualNotes": [],
        "vocabulary": [
            {
                "term": "lathe",
                "definitionZh": "车床",
                "definitionEn": "A machine tool",
                "example": "A lathe removes material.",
                "sourceIds": [source_id],
            }
        ],
        "phrases": [],
        "keyPoints": [{"text": "Safety comes first.", "sourceIds": [source_id]}],
        "questions": [],
        "quizCards": [],
    }


def learning_payload(source_id="page-1"):
    return {
        "courseName": "Synthetic Engineering Classroom",
        "courseNature": "Reliability verification",
        "language": "zh-en",
        "analysisMode": "SESSION",
        "chunks": [
            {
                "sourceId": source_id,
                "text": "Synthetic classroom text about safe machining practice.",
                "page": 1,
            }
        ],
        "manualDoubts": [],
        "visualBlocks": [],
    }


@contextmanager
def job_client(settings, handler):
    client = make_client(settings, handler)
    client.app.state.v2_provider = V2Provider(
        settings, transport=httpx.MockTransport(handler)
    )
    with client:
        yield client


def wait_for_job(client, job_id, headers, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get(f"/v2/learning-pack/jobs/{job_id}", headers=headers)
        assert response.status_code == 200, response.text
        data = response.json()
        if data["status"] in {"succeeded", "failed"}:
            return data
        time.sleep(0.01)
    raise AssertionError("learning pack job did not finish in time")


def test_job_has_total_timeout_and_returns_friendly_failure(settings, monkeypatch):
    async def hanging_generate(_request):
        await asyncio.sleep(1)
        raise AssertionError("hanging provider should have been cancelled")

    monkeypatch.setattr("app.learning_jobs.LEARNING_PACK_JOB_TIMEOUT_SECONDS", 0.02)
    with job_client(settings, lambda request: chat_response(learning_package())) as client:
        client.app.state.v2_provider.generate_learning_pack = hanging_generate
        headers = auth_headers(client)
        created = client.post(
            "/v2/learning-pack/jobs", json=learning_payload(), headers=headers
        )
        assert created.status_code == 202

        result = wait_for_job(client, created.json()["jobId"], headers)
        assert result["status"] == "failed"
        assert result["error"]["code"] == "provider_unavailable"
        assert "超时" in result["error"]["message"]


def test_create_job_returns_202_and_poll_succeeds(settings):
    calls = []

    def handler(request):
        calls.append(request)
        return chat_response(learning_package())

    with job_client(settings, handler) as client:
        headers = auth_headers(client)
        response = client.post(
            "/v2/learning-pack/jobs", json=learning_payload(), headers=headers
        )

        assert response.status_code == 202, response.text
        created = response.json()
        assert created["status"] in {"queued", "processing"}
        job = wait_for_job(client, created["jobId"], headers)
        with client.app.state.db.connect() as connection:
            stored = dict(
                connection.execute(
                    "SELECT * FROM learning_pack_jobs WHERE id = ?",
                    (created["jobId"],),
                ).fetchone()
            )

    assert job["status"] == "succeeded"
    assert stored["result_json"]
    assert stored["analysis_id"] == job["result"]["analysisId"]
    assert stored["model"] == job["result"]["model"]
    assert stored["input_sha256"] == job["result"]["inputSha256"]
    assert "Synthetic classroom text" not in str(stored)
    assert job["result"]["package"]["minutes"]["title"] == "Synthetic classroom minutes"
    assert job["result"]["inputSha256"] == canonical_learning_pack_sha256(
        LearningPackRequest.model_validate(learning_payload())
    )
    assert job["result"]["promptVersion"] == "learning-minutes-v4"
    assert job["result"]["schemaVersion"] == "2.0"
    assert job["result"]["model"] == "mock-model"
    assert job["result"]["analysisId"]
    assert "error" not in job
    assert len(calls) == 1


def test_failed_job_has_sanitized_friendly_error(settings):
    def handler(request):
        return httpx.Response(500, request=request)

    with job_client(settings, handler) as client:
        headers = auth_headers(client)
        created = client.post(
            "/v2/learning-pack/jobs", json=learning_payload(), headers=headers
        ).json()
        job = wait_for_job(client, created["jobId"], headers)
        with client.app.state.db.connect() as connection:
            stored = dict(
                connection.execute(
                    "SELECT * FROM learning_pack_jobs WHERE id = ?",
                    (created["jobId"],),
                ).fetchone()
            )

    assert job["status"] == "failed"
    assert job["error"]["code"] == "provider_unavailable"
    assert "暂时不可用" in job["error"]["message"]
    assert "test-only-key" not in str(job)
    assert "Synthetic classroom text" not in str(job)
    assert "Synthetic classroom text" not in str(stored)
    assert "result" not in job


def test_quota_is_released_after_failure_and_enforced_after_success(settings):
    limited = replace(
        settings,
        device_daily_quota=1,
        account_default_ai_pack_daily_limit=1,
    )
    calls = 0
    fail = {"enabled": True}

    def handler(request):
        nonlocal calls
        calls += 1
        if fail["enabled"]:
            return httpx.Response(500, request=request)
        return chat_response(learning_package())

    with job_client(limited, handler) as client:
        headers = auth_headers(client)
        first = client.post(
            "/v2/learning-pack/jobs", json=learning_payload(), headers=headers
        ).json()
        failed = wait_for_job(client, first["jobId"], headers)
        assert failed["status"] == "failed"

        fail["enabled"] = False
        second = client.post(
            "/v2/learning-pack/jobs", json=learning_payload(), headers=headers
        ).json()
        assert second["jobId"] != first["jobId"]
        succeeded = wait_for_job(client, second["jobId"], headers)
        assert succeeded["status"] == "succeeded"

        payload = learning_payload()
        payload["courseName"] = "Second Synthetic Classroom"
        third = client.post(
            "/v2/learning-pack/jobs", json=payload, headers=headers
        ).json()
        quota_failed = wait_for_job(client, third["jobId"], headers)

    assert quota_failed["status"] == "failed"
    assert quota_failed["error"]["code"] == "quota_exceeded"
    assert "额度已用完" in quota_failed["error"]["message"]
    assert calls == 2


def test_cross_device_access_returns_404(settings):
    def handler(request):
        return chat_response(learning_package())

    with job_client(settings, handler) as client:
        owner_headers = auth_headers(client)
        created = client.post(
            "/v2/learning-pack/jobs", json=learning_payload(), headers=owner_headers
        ).json()
        wait_for_job(client, created["jobId"], owner_headers)
        other_token = register(client)["token"]
        other_headers = {"Authorization": f"Bearer {other_token}"}

        other_response = client.get(
            f"/v2/learning-pack/jobs/{created['jobId']}", headers=other_headers
        )
        owner_response = client.get(
            f"/v2/learning-pack/jobs/{created['jobId']}", headers=owner_headers
        )

    assert other_response.status_code in {403, 404}
    assert owner_response.status_code == 200


def test_duplicate_request_reuses_active_or_recent_success(settings):
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        return chat_response(learning_package())

    with job_client(settings, handler) as client:
        headers = auth_headers(client)
        first = client.post(
            "/v2/learning-pack/jobs", json=learning_payload(), headers=headers
        ).json()
        wait_for_job(client, first["jobId"], headers)

        duplicate = client.post(
            "/v2/learning-pack/jobs", json=learning_payload(), headers=headers
        )
        assert duplicate.status_code == 202
        assert duplicate.json()["jobId"] == first["jobId"]
        assert calls == 1

        with client.app.state.db.connect() as connection:
            connection.execute(
                "UPDATE learning_pack_jobs SET updated_at = ? WHERE id = ?",
                ("2000-01-01T00:00:00+00:00", first["jobId"]),
            )

        refreshed = client.post(
            "/v2/learning-pack/jobs", json=learning_payload(), headers=headers
        ).json()
        assert refreshed["jobId"] != first["jobId"]
        wait_for_job(client, refreshed["jobId"], headers)

    assert calls == 2


def test_queued_or_processing_job_is_reused(settings):
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        return chat_response(learning_package())

    with job_client(settings, handler) as client:
        registration = register(client)
        headers = {"Authorization": f"Bearer {registration['token']}"}
        payload = LearningPackRequest.model_validate(learning_payload())
        job, created = client.app.state.db.create_or_get_learning_pack_job(
            registration["deviceId"],
            canonical_learning_pack_sha256(payload),
            "2100-01-01T00:00:00+00:00",
        )
        assert created
        client.app.state.db.mark_learning_pack_job_processing(
            registration["deviceId"], job["id"]
        )

        duplicate = client.post(
            "/v2/learning-pack/jobs", json=learning_payload(), headers=headers
        )
        polled = client.get(
            f"/v2/learning-pack/jobs/{job['id']}", headers=headers
        )

    assert duplicate.status_code == 202
    assert duplicate.json()["jobId"] == job["id"]
    assert duplicate.json()["status"] == "processing"
    assert polled.json()["status"] == "processing"
    assert calls == 0


def test_invalid_provider_response_has_sanitized_code(settings):
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        return chat_response("provider-secret-json")

    with job_client(settings, handler) as client:
        headers = auth_headers(client)
        created = client.post(
            "/v2/learning-pack/jobs", json=learning_payload(), headers=headers
        ).json()
        job = wait_for_job(client, created["jobId"], headers)

    assert job["status"] == "failed"
    assert job["error"]["code"] == "invalid_response"
    assert "provider-secret-json" not in str(job)
    assert calls == 2


def test_restart_marks_pending_jobs_failed(settings):
    with job_client(
        settings, lambda request: chat_response(learning_package())
    ) as client:
        registration = register(client)
        headers = {"Authorization": f"Bearer {registration['token']}"}
        payload = LearningPackRequest.model_validate(learning_payload())
        job, created = client.app.state.db.create_or_get_learning_pack_job(
            registration["deviceId"],
            canonical_learning_pack_sha256(payload),
            "2100-01-01T00:00:00+00:00",
        )
        assert created

    with TestClient(create_app(settings)) as restarted:
        response = restarted.get(
            f"/v2/learning-pack/jobs/{job['id']}", headers=headers
        )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "failed"
    assert data["error"]["code"] == "internal"
    assert "服务重启" in data["error"]["message"]


def test_provider_and_vision_configuration_are_checked(settings, monkeypatch):
    visual_payload = learning_payload()
    visual_payload["visualBlocks"] = [
        {
            "sourceId": "figure-1",
            "ocrText": "Red circle and F=m*a",
            "imageBase64": "A" * 40,
            "mimeType": "image/png",
        }
    ]

    with job_client(
        settings, lambda request: chat_response(learning_package())
    ) as client:
        headers = auth_headers(client)
        client.app.state.v2_provider = None
        unavailable = client.post(
            "/v2/learning-pack/jobs", json=learning_payload(), headers=headers
        )
        assert unavailable.status_code == 503

        client.app.state.v2_provider = V2Provider(settings)
        monkeypatch.setattr("app.v2_routes.vision_endpoints_from_env", lambda: [])
        no_vision = client.post(
            "/v2/learning-pack/jobs", json=visual_payload, headers=headers
        )

    assert no_vision.status_code == 503
    assert "Vision provider is not configured" in no_vision.json()["detail"]


def test_internal_error_message_is_sanitized(settings):
    class BrokenProvider:
        model_used = "mock-model"

        async def generate_learning_pack(self, request):
            raise RuntimeError("provider-secret-body")

    with job_client(
        settings, lambda request: chat_response(learning_package())
    ) as client:
        client.app.state.v2_provider = BrokenProvider()
        headers = auth_headers(client)
        created = client.post(
            "/v2/learning-pack/jobs", json=learning_payload(), headers=headers
        ).json()
        job = wait_for_job(client, created["jobId"], headers)

    assert job["status"] == "failed"
    assert job["error"]["code"] == "internal"
    assert "内部错误" in job["error"]["message"]
    assert "provider-secret-body" not in str(job)
