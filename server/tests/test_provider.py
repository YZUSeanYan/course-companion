import socket
from dataclasses import replace

import httpx
import pytest

from app.provider import ProviderConfigurationError, validate_provider_url
from conftest import auth_headers, chat_response, make_client, valid_package


@pytest.mark.parametrize("failure", ["timeout", "connect", "429", "500", "503"])
def test_transient_failures_have_bounded_retries(settings, payload, failure):
    configured = replace(settings, provider_max_retries=2)
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        if failure == "timeout":
            raise httpx.ReadTimeout("mock timeout", request=request)
        if failure == "connect":
            raise httpx.ConnectError("mock connection failure", request=request)
        return httpx.Response(int(failure), request=request)

    client = make_client(configured, handler)
    response = client.post("/v1/analyze", json=payload, headers=auth_headers(client))
    assert response.status_code == 503
    assert "bounded retries" in response.json()["detail"]
    assert calls == 3


def test_retry_can_succeed_without_extra_repair(settings, payload):
    configured = replace(settings, provider_max_retries=2)
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(429, request=request)
        return chat_response(valid_package())

    client = make_client(configured, handler)
    response = client.post("/v1/analyze", json=payload, headers=auth_headers(client))
    assert response.status_code == 200
    assert calls == 2


@pytest.mark.parametrize(
    "url",
    [
        "ftp://1.1.1.1/v1",
        "http://localhost:8080",
        "http://service.localhost",
        "http://127.0.0.1/v1",
        "http://10.0.0.2",
        "http://172.16.0.1",
        "http://192.168.1.2",
        "http://169.254.169.254/latest",
        "http://0.0.0.0",
        "http://224.0.0.1",
        "http://[::1]",
        "http://[fc00::1]",
        "http://[fe80::1]",
        "https://user:pass@1.1.1.1/v1",
    ],
)
def test_ssrf_and_forbidden_addresses_are_rejected(url):
    with pytest.raises(ProviderConfigurationError):
        validate_provider_url(url)


def test_dns_result_is_checked_for_private_addresses(monkeypatch):
    def private_resolution(*args, **kwargs):
        return [
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                socket.IPPROTO_TCP,
                "",
                ("127.0.0.1", 443),
            )
        ]

    monkeypatch.setattr(socket, "getaddrinfo", private_resolution)
    with pytest.raises(ProviderConfigurationError, match="forbidden address"):
        validate_provider_url("https://provider.internal.example/v1")


def test_public_dns_result_is_allowed(monkeypatch):
    def public_resolution(*args, **kwargs):
        return [
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                socket.IPPROTO_TCP,
                "",
                ("1.1.1.1", 443),
            )
        ]

    monkeypatch.setattr(socket, "getaddrinfo", public_resolution)
    assert (
        validate_provider_url("https://provider.example/v1/")
        == "https://provider.example/v1/chat/completions"
    )


def test_ssrf_rejection_happens_before_any_http_request(settings, payload):
    configured = replace(settings, provider_base_url="http://127.0.0.1:9000/v1")
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        return chat_response(valid_package())

    client = make_client(configured, handler)
    response = client.post("/v1/analyze", json=payload, headers=auth_headers(client))
    assert response.status_code == 503
    assert "forbidden address" in response.json()["detail"]
    assert calls == 0
