import json
import hashlib
import logging
from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

from app.lecsync import LECSYNC_BASE_URL, LecsyncClient
from app.main import create_app
from app.v2_provider import V2Provider
from conftest import auth_headers, chat_response, make_client

TEST_LECSYNC_KEY = "test-only-lecsync-key-not-a-credential"
TRANSLATE_PAYLOAD = {
    "lineId": 7,
    "sourceText": "lathe",
    "sourceHash": hashlib.sha256(b"lathe").hexdigest(),
    "targetLang": "zh-CN",
}


def lecsync_response(request_id="req-1", text="车床", model="lecsync-actual-model"):
    return {
        "request_id": request_id,
        "status": "succeeded",
        "text": text,
        "model": model,
    }


def validate_official_url(base_url):
    assert base_url == LECSYNC_BASE_URL
    return base_url + "/chat/completions"


def configured_client(
    settings,
    monkeypatch,
    lecsync_handler,
    fallback_handler,
    *,
    credential=TEST_LECSYNC_KEY,
):
    monkeypatch.setattr("app.lecsync.validate_provider_url", validate_official_url)
    for name in ("DEEPSEEK_API_KEY", "KIMI_API_KEY", "MIMO_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    if credential is None:
        monkeypatch.delenv("LECSYNC_API_KEY", raising=False)
    else:
        monkeypatch.setenv("LECSYNC_API_KEY", credential)
    client = make_client(settings, fallback_handler)
    client.app.state.v2_provider = V2Provider(
        settings, transport=httpx.MockTransport(fallback_handler)
    )
    if credential is not None:
        client.app.state.lecsync = LecsyncClient(
            credential,
            transport=httpx.MockTransport(lecsync_handler),
            timeout=0.1,
            status_poll_interval=0,
            max_status_checks=2,
        )
    return client


def post_translate(client):
    return client.post(
        "/v2/translate", json=TRANSLATE_PAYLOAD, headers=auth_headers(client)
    )


@pytest.mark.parametrize(
    ("target_lang", "api_target"),
    [("zh-CN", "zh"), ("en-US", "en")],
)
def test_lecsync_success_uses_documented_request_and_actual_model(
    settings, monkeypatch, target_lang, api_target
):
    calls = []

    def lecsync_handler(request):
        calls.append(request)
        return httpx.Response(200, json=lecsync_response(), request=request)

    def unexpected_fallback(request):
        raise AssertionError("the existing provider must not run after Lecsync succeeds")

    client = configured_client(
        settings, monkeypatch, lecsync_handler, unexpected_fallback
    )
    payload = {**TRANSLATE_PAYLOAD, "targetLang": target_lang}
    headers = auth_headers(client)
    first = client.post("/v2/translate", json=payload, headers=headers)
    second = client.post("/v2/translate", json=payload, headers=headers)

    assert first.status_code == 200, first.text
    assert first.json()["translation"] == "车床"
    assert first.json()["model"] == "lecsync-actual-model"
    assert second.json()["model"] == "lecsync-actual-model"
    assert len(calls) == 1
    request = calls[0]
    assert str(request.url) == f"{LECSYNC_BASE_URL}/translate"
    assert request.headers["Authorization"] == f"Bearer {TEST_LECSYNC_KEY}"
    assert json.loads(request.content) == {
        "text": "lathe",
        "source_lang": "auto",
        "target_lang": api_target,
        "context": "",
        "terms": [],
        "model": "translate-default",
    }
    idempotency_key = request.headers["Idempotency-Key"]
    assert idempotency_key == (
        f"lecsync-translate-v1-line7-{hashlib.sha256(b'lathe').hexdigest()}-{api_target}"
    )
    idempotency_key.encode("ascii")
    assert all(32 <= ord(character) <= 126 for character in idempotency_key)


def test_lecsync_failure_falls_back_to_existing_v2_provider(settings, monkeypatch):
    fallback_calls = []

    def lecsync_handler(request):
        return httpx.Response(503, request=request)

    def fallback_handler(request):
        fallback_calls.append(request)
        return chat_response("回退译文")

    client = configured_client(
        settings, monkeypatch, lecsync_handler, fallback_handler
    )
    response = post_translate(client)

    assert response.status_code == 200, response.text
    assert response.json()["translation"] == "回退译文"
    assert response.json()["model"] == "mock-model"
    assert len(fallback_calls) == 1


def test_lecsync_504_queries_original_request_without_reposting(settings, monkeypatch):
    calls = []

    def lecsync_handler(request):
        calls.append(request)
        if request.method == "POST":
            return httpx.Response(
                504,
                json={"request_id": "req-504", "status": "processing"},
                request=request,
            )
        assert request.url.path == "/v1/requests/req-504"
        return httpx.Response(
            200, json=lecsync_response(request_id="req-504"), request=request
        )

    client = configured_client(
        settings,
        monkeypatch,
        lecsync_handler,
        lambda request: (_ for _ in ()).throw(AssertionError("unexpected fallback")),
    )
    response = post_translate(client)

    assert response.status_code == 200, response.text
    assert response.json()["translation"] == "车床"
    assert [request.method for request in calls] == ["POST", "GET"]
    assert calls[0].headers["Idempotency-Key"]


def test_lecsync_pending_is_bounded_and_never_returned_as_translation(
    settings, monkeypatch
):
    calls = []

    def lecsync_handler(request):
        calls.append(request)
        return httpx.Response(
            200,
            json={"request_id": "req-pending", "status": "processing"},
            request=request,
        )

    client = configured_client(
        settings,
        monkeypatch,
        lecsync_handler,
        lambda request: chat_response("有界回退"),
    )
    response = post_translate(client)

    assert response.status_code == 200, response.text
    assert response.json()["translation"] == "有界回退"
    assert [request.method for request in calls] == ["POST", "GET", "GET"]
    assert response.json()["translation"] != "processing"


def test_lecsync_invalid_status_falls_back(settings, monkeypatch):
    def lecsync_handler(request):
        return httpx.Response(
            200,
            json={
                "request_id": "req-invalid",
                "status": "finished",
                "text": "not a documented status",
                "model": "translate-default",
            },
            request=request,
        )

    client = configured_client(
        settings,
        monkeypatch,
        lecsync_handler,
        lambda request: chat_response("无效状态回退"),
    )
    response = post_translate(client)

    assert response.status_code == 200, response.text
    assert response.json()["translation"] == "无效状态回退"


def test_lecsync_succeeded_with_empty_text_falls_back(settings, monkeypatch):
    def lecsync_handler(request):
        return httpx.Response(
            200, json=lecsync_response(text="   "), request=request
        )

    client = configured_client(
        settings,
        monkeypatch,
        lecsync_handler,
        lambda request: chat_response("空响应回退"),
    )
    response = post_translate(client)

    assert response.status_code == 200, response.text
    assert response.json()["translation"] == "空响应回退"


def test_lecsync_network_loss_does_not_guess_request_id_or_repost(
    settings, monkeypatch
):
    calls = []

    def lecsync_handler(request):
        calls.append(request)
        raise httpx.ReadTimeout("mock response loss", request=request)

    client = configured_client(
        settings,
        monkeypatch,
        lecsync_handler,
        lambda request: chat_response("超时回退"),
    )
    response = post_translate(client)

    assert response.status_code == 200, response.text
    assert response.json()["translation"] == "超时回退"
    assert len(calls) == 1
    assert calls[0].method == "POST"


def test_lecsync_without_credentials_uses_existing_fallback(settings, monkeypatch):
    def unexpected_lecsync(request):
        raise AssertionError("Lecsync must not be called without credentials")

    client = configured_client(
        settings,
        monkeypatch,
        unexpected_lecsync,
        lambda request: chat_response("无凭据回退"),
        credential=None,
    )
    response = post_translate(client)

    assert response.status_code == 200, response.text
    assert response.json()["translation"] == "无凭据回退"
    assert client.app.state.lecsync.configured is False


def test_lecsync_can_translate_without_existing_provider(settings, monkeypatch):
    configured = replace(
        settings,
        provider_base_url=None,
        provider_model=None,
        provider_api_key=None,
    )
    monkeypatch.setenv("LECSYNC_API_KEY", TEST_LECSYNC_KEY)
    monkeypatch.setattr("app.lecsync.validate_provider_url", validate_official_url)
    client = TestClient(create_app(configured))
    client.app.state.lecsync = LecsyncClient(
        TEST_LECSYNC_KEY,
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200, json=lecsync_response(), request=request
            )
        ),
    )

    response = post_translate(client)

    assert response.status_code == 200, response.text
    assert response.json()["model"] == "lecsync-actual-model"


def test_lecsync_and_fallback_errors_do_not_leak_key(
    settings, monkeypatch, caplog
):
    caplog.set_level(logging.DEBUG)

    def lecsync_handler(request):
        assert request.headers["Authorization"] == f"Bearer {TEST_LECSYNC_KEY}"
        return httpx.Response(503, request=request)

    client = configured_client(
        settings,
        monkeypatch,
        lecsync_handler,
        lambda request: httpx.Response(503, request=request),
    )
    response = post_translate(client)

    assert response.status_code == 503
    assert TEST_LECSYNC_KEY not in response.text
    assert TEST_LECSYNC_KEY not in caplog.text
