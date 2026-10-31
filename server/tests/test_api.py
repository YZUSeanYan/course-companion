import hashlib
import json
import logging
import sqlite3
from dataclasses import replace

from fastapi.testclient import TestClient

from app.main import create_app
from conftest import (
    ALL_OUTPUTS,
    auth_headers,
    chat_response,
    make_client,
    register,
    valid_package,
)


def test_health_works_without_provider(settings):
    unconfigured = replace(
        settings,
        provider_base_url=None,
        provider_model=None,
        provider_api_key=None,
    )
    client = TestClient(create_app(unconfigured))
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "providerConfigured": False}


def test_device_auth_and_only_token_hash_is_stored(settings, payload):
    unconfigured = replace(
        settings,
        provider_base_url=None,
        provider_model=None,
        provider_api_key=None,
    )
    client = TestClient(create_app(unconfigured))
    registered = register(client)
    token = registered["token"]
    assert registered["tokenType"] == "bearer"

    with sqlite3.connect(settings.database_path) as connection:
        stored_hash = connection.execute(
            "SELECT token_hash FROM devices WHERE id = ?", (registered["deviceId"],)
        ).fetchone()[0]
    assert token not in stored_hash
    assert len(stored_hash) == 64

    assert client.post("/v1/analyze", json=payload).status_code == 401
    assert (
        client.post(
            "/v1/analyze", json=payload, headers={"Authorization": "Bearer wrong"}
        ).status_code
        == 401
    )
    response = client.post(
        "/v1/analyze", json=payload, headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 503
    assert "missing AI_PROVIDER_BASE_URL" in response.json()["detail"]


def test_successful_analysis_and_no_content_in_database_or_logs(
    settings, payload, caplog
):
    requests = []

    def handler(request):
        requests.append(request)
        body = json.loads(request.content)
        assert body["model"] == "mock-model"
        assert body["response_format"] == {"type": "json_object"}
        assert request.headers["Authorization"] == "Bearer test-only-key"
        return chat_response(valid_package())

    client = make_client(settings, handler)
    registered = register(client)
    caplog.set_level(logging.INFO)
    response = client.post(
        "/v1/analyze",
        json=payload,
        headers={"Authorization": f"Bearer {registered['token']}"},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["model"] == "mock-model"
    assert data["promptVersion"] == "learning-pack-v1"
    assert data["schemaVersion"] == "1.0"
    assert len(data["analysisId"]) == 36
    assert len(data["inputSha256"]) == 64
    assert data["package"]["vocabulary"][0]["definitionZh"] == "有丝分裂"
    assert len(requests) == 1

    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    assert data["inputSha256"] == hashlib.sha256(canonical.encode()).hexdigest()
    with sqlite3.connect(settings.database_path) as connection:
        tables = ("devices", "daily_usage", "analyses")
        rows = [
            (table, connection.execute(f"SELECT * FROM {table}").fetchall())
            for table in tables
        ]
        assert connection.execute("SELECT COUNT(*) FROM analyses").fetchone()[0] == 1
        assert connection.execute(
            "SELECT analysis_count FROM daily_usage"
        ).fetchone()[0] == 1
    persisted = repr(rows)
    assert payload["courseName"] not in persisted
    for chunk in payload["chunks"]:
        assert chunk["text"] not in persisted
    assert registered["token"] not in persisted
    assert payload["courseName"] not in caplog.text
    assert payload["chunks"][0]["text"] not in caplog.text
    assert registered["token"] not in caplog.text


def test_malformed_json_gets_exactly_one_repair(settings, payload):
    calls = []

    def handler(request):
        calls.append(json.loads(request.content))
        if len(calls) == 1:
            return chat_response("{not-json")
        return chat_response(valid_package())

    client = make_client(settings, handler)
    response = client.post("/v1/analyze", json=payload, headers=auth_headers(client))
    assert response.status_code == 200, response.text
    assert len(calls) == 2
    repair_message = calls[1]["messages"][-1]["content"]
    assert "Validation error:" in repair_message
    assert "corrected JSON" in repair_message


def test_requested_output_subset_returns_other_arrays_empty(settings, payload):
    payload["requestedOutputs"] = ["summary"]
    package = valid_package()
    for output_name in ALL_OUTPUTS:
        if output_name != "summary":
            package[output_name] = []

    client = make_client(settings, lambda request: chat_response(package))
    response = client.post("/v1/analyze", json=payload, headers=auth_headers(client))
    assert response.status_code == 200, response.text
    result = response.json()["package"]
    assert len(result["summary"]) == 1
    for output_name in ALL_OUTPUTS:
        if output_name != "summary":
            assert result[output_name] == []


def test_unknown_output_source_is_repaired_then_rejected(settings, payload):
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        return chat_response(valid_package(source_id="not-in-input"))

    client = make_client(settings, handler)
    response = client.post("/v1/analyze", json=payload, headers=auth_headers(client))
    assert response.status_code == 502
    assert "after one repair" in response.json()["detail"]
    assert calls == 2


def test_input_sources_ranges_and_requested_outputs_are_strict(settings, payload):
    client = make_client(settings, lambda request: chat_response(valid_package()))
    headers = auth_headers(client)

    duplicate = json.loads(json.dumps(payload))
    duplicate["chunks"][1]["sourceId"] = "slide-1"
    assert client.post("/v1/analyze", json=duplicate, headers=headers).status_code == 422

    bad_range = json.loads(json.dumps(payload))
    bad_range["chunks"][1]["endMs"] = 1000
    assert client.post("/v1/analyze", json=bad_range, headers=headers).status_code == 422

    bad_page = json.loads(json.dumps(payload))
    bad_page["chunks"][0]["page"] = 0
    assert client.post("/v1/analyze", json=bad_page, headers=headers).status_code == 422

    duplicate_output = json.loads(json.dumps(payload))
    duplicate_output["requestedOutputs"] = ["summary", "summary"]
    assert (
        client.post("/v1/analyze", json=duplicate_output, headers=headers).status_code
        == 422
    )


def test_daily_quota_is_enforced(settings, payload):
    limited = replace(settings, device_daily_quota=1, analyze_rate_limit=10)
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        return chat_response(valid_package())

    client = make_client(limited, handler)
    headers = auth_headers(client)
    assert client.post("/v1/analyze", json=payload, headers=headers).status_code == 200
    assert client.post("/v1/analyze", json=payload, headers=headers).status_code == 429
    assert calls == 1


def test_registration_rate_limit(settings):
    limited = replace(settings, register_rate_limit=1)
    client = TestClient(create_app(limited))
    assert client.post("/v1/devices/register").status_code == 201
    assert client.post("/v1/devices/register").status_code == 429
