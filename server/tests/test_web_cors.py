# -*- coding: utf-8 -*-
"""网页版跨源部署的可选 CORS 白名单（WEB_CORS_ORIGINS）。"""

from __future__ import annotations

from dataclasses import replace

from fastapi.testclient import TestClient

from app.main import create_app


def test_cors_preflight_and_error_headers(settings):
    enabled = replace(settings, web_cors_origins=("https://web.example.com",))
    client = TestClient(create_app(enabled))

    preflight = client.options(
        "/v1/devices/register",
        headers={
            "Origin": "https://web.example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization, content-type",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == "https://web.example.com"
    allowed_headers = preflight.headers["access-control-allow-headers"].lower()
    assert "authorization" in allowed_headers
    assert "content-type" in allowed_headers

    response = client.get(
        "/health",
        headers={"Origin": "https://web.example.com"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://web.example.com"

    denied = client.get(
        "/health",
        headers={"Origin": "https://evil.example.net"},
    )
    assert "access-control-allow-origin" not in denied.headers


def test_cors_disabled_by_default(settings):
    client = TestClient(create_app(settings))
    response = client.get("/health", headers={"Origin": "https://web.example.com"})
    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers
