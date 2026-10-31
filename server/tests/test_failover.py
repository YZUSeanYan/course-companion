import json
from dataclasses import replace

import httpx

from conftest import auth_headers, chat_response, make_client, valid_package


def test_failover_follows_deepseek_kimi_mimo_order(settings, payload, monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek")
    monkeypatch.setenv("KIMI_API_KEY", "test-kimi")
    monkeypatch.setenv("MIMO_API_KEY", "test-mimo")
    monkeypatch.setattr("app.provider.validate_provider_url", lambda base: base.rstrip("/") + "/chat/completions")
    models = []

    def handler(request):
        model = json.loads(request.content)["model"]
        models.append(model)
        if model == "deepseek-flash":
            return httpx.Response(500, request=request)
        return chat_response(valid_package())

    client = make_client(settings, handler)
    response = client.post("/v1/analyze", json=payload, headers=auth_headers(client))

    assert response.status_code == 200, response.text
    assert models == ["deepseek-flash", "k3.1-pro-highspeed"]
    assert response.json()["model"] == "k3.1-pro-highspeed"
    assert "test-deepseek" not in response.text
    assert "test-kimi" not in response.text


def test_all_providers_fail_in_order_without_secret_leakage(settings, payload, monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek")
    monkeypatch.setenv("KIMI_API_KEY", "test-kimi")
    monkeypatch.setenv("MIMO_API_KEY", "test-mimo")
    monkeypatch.setattr("app.provider.validate_provider_url", lambda base: base.rstrip("/") + "/chat/completions")
    models = []

    def handler(request):
        model = json.loads(request.content)["model"]
        models.append(model)
        if model == "deepseek-flash":
            raise httpx.ReadTimeout("timeout", request=request)
        if model == "k3.1-pro-highspeed":
            return httpx.Response(429, request=request)
        return httpx.Response(503, request=request)

    configured = replace(settings, provider_max_retries=0)
    client = make_client(configured, handler)
    response = client.post("/v1/analyze", json=payload, headers=auth_headers(client))

    assert response.status_code == 503
    assert models == ["deepseek-flash", "k3.1-pro-highspeed", "mimo-v2.6-flash"]
    for secret in ("test-deepseek", "test-kimi", "test-mimo"):
        assert secret not in response.text
