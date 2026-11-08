from __future__ import annotations

import secrets
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import QuotaExceeded
from app.main import create_app
from app.security import activation_code_digest, phone_digest, token_digest
from conftest import (
    bind_test_device,
    chat_response,
    create_test_account,
    make_client,
    register,
    register_unactivated,
    valid_package,
)


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _activate(client, token: str, phone: str):
    # Tests mint valid OTP records directly rather than contacting SMS.
    db = client.app.state.db
    pepper = client.app.state.settings.token_pepper
    code = "246810"
    phone_hash = phone_digest(phone, pepper)
    if db.account_by_phone_hash(phone_hash) is not None:
        device = db.find_device_by_token_hash(token_digest(token, pepper))
        db.create_activation_code(
            phone_hash,
            activation_code_digest(phone, code, pepper),
            "2099-12-31T23:59:59+00:00",
            None,
            device,
        )
    return client.post(
        "/v1/accounts/activate",
        json={"phone": phone, "code": code},
        headers=_bearer(token),
    )


def test_unactivated_device_gets_actionable_account_errors(settings, payload):
    client = make_client(settings, lambda request: chat_response(valid_package()))
    registered = register_unactivated(client)
    headers = _bearer(registered["token"])

    response = client.post("/v1/analyze", json=payload, headers=headers)
    assert response.status_code == 403
    assert response.headers["X-Zhixi-Error-Code"] == "account_required"
    # 文案同时服务 App 与网页版：不再出现「更新到最新版知习」这类客户端专属指引。
    detail = response.json()["detail"]
    assert "试用额度" in detail
    assert "App" not in detail

    status_response = client.get("/v1/accounts/me", headers=headers)
    assert status_response.status_code == 200
    body = status_response.json()
    assert body["activated"] is False
    assert body["required"] is True
    assert body["status"] == "none"


def test_activation_binds_phone_and_returns_limits(settings):
    client = TestClient(create_app(settings))
    account, phone = create_test_account(
        client,
        phone="13900000002",
        valid_until="2099-12-31",
        ai_pack_daily_limit=7,
        audio_minutes_daily_limit=30,
        text_chars_daily_limit=12345,
        document_daily_limit=4,
        max_devices=2,
    )
    registered = register_unactivated(client)
    response = _activate(client, registered["token"], phone)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["activated"] is True
    assert body["status"] == "active"
    assert body["phoneMasked"] == "139****0002"
    assert body["validUntil"] == "2099-12-31"
    assert body["limits"] == {
        "aiPacksPerDay": 7,
        "audioMinutesPerDay": 30,
        "textCharactersPerDay": 12345,
        "documentsPerDay": 4,
        "maxDevices": 2,
    }

    row = client.app.state.db.account_by_id(account["id"])
    assert row is not None
    assert phone not in row["phone_ciphertext"]
    assert row["phone_hash"] != phone


def test_activation_rejects_unknown_and_invalid_phone(settings):
    client = TestClient(create_app(settings))
    registered = register_unactivated(client)
    unknown = _activate(client, registered["token"], "13900000003")
    assert unknown.status_code == 404
    assert unknown.headers["X-Zhixi-Error-Code"] == "account_not_found"

    invalid = _activate(client, registered["token"], "12345")
    assert invalid.status_code == 422
    assert "11 位" in invalid.json()["detail"]


def test_disabled_and_expired_accounts_are_rejected(settings):
    client = TestClient(create_app(settings))
    disabled, disabled_phone = create_test_account(client, phone="13900000004")
    client.app.state.db.update_account(disabled["id"], {"status": "disabled"})
    registered = register_unactivated(client)
    response = _activate(client, registered["token"], disabled_phone)
    assert response.status_code == 403
    assert response.headers["X-Zhixi-Error-Code"] == "account_disabled"

    expired, expired_phone = create_test_account(
        client, phone="13900000005", valid_until="2000-01-01"
    )
    assert expired["id"]
    response = _activate(client, registered["token"], expired_phone)
    assert response.status_code == 403
    assert response.headers["X-Zhixi-Error-Code"] == "account_expired"


def test_device_limit_is_enforced_but_same_device_is_idempotent(settings):
    client = TestClient(create_app(settings))
    account, phone = create_test_account(
        client, phone="13900000006", max_devices=1
    )
    first = register_unactivated(client)
    assert _activate(client, first["token"], phone).status_code == 200
    assert _activate(client, first["token"], phone).status_code == 200

    second = register_unactivated(client)
    response = _activate(client, second["token"], phone)
    assert response.status_code == 403
    assert response.headers["X-Zhixi-Error-Code"] == "device_limit_reached"
    assert account["id"]


def test_shared_account_quota_across_two_devices(settings):
    limited = replace(
        settings,
        account_default_ai_pack_daily_limit=2,
        analyze_rate_limit=10,
    )
    client = make_client(limited, lambda request: chat_response(valid_package("s1")))
    account, phone = create_test_account(
        client, phone="13900000007", ai_pack_daily_limit=2, max_devices=5
    )
    first = register_unactivated(client)
    second = register_unactivated(client)
    assert _activate(client, first["token"], phone).status_code == 200
    assert _activate(client, second["token"], phone).status_code == 200

    payload = {
        "courseName": "Shared quota",
        "language": "en",
        "chunks": [{"sourceId": "s1", "text": "content"}],
        "requestedOutputs": [
            "summary",
            "vocabulary",
            "phrases",
            "keyPoints",
            "questions",
            "quizCards",
        ],
    }
    first_headers = _bearer(first["token"])
    second_headers = _bearer(second["token"])
    assert client.post("/v1/analyze", json=payload, headers=first_headers).status_code == 200
    assert client.post("/v1/analyze", json=payload, headers=second_headers).status_code == 200
    exhausted = client.post("/v1/analyze", json=payload, headers=second_headers)
    assert exhausted.status_code == 429
    assert exhausted.headers["X-Zhixi-Error-Code"] == "quota_exceeded"
    assert exhausted.headers["X-Zhixi-Quota-Scope"] == "ai_pack"
    assert "2/2" in exhausted.json()["detail"]
    usage = client.app.state.db.account_usage_today(account["id"], client.app.state.db.today())
    assert usage["aiPacks"] == 2


def test_document_quota_is_account_level(settings):
    client = TestClient(create_app(settings))
    account, _ = create_test_account(
        client, phone="13900000008", document_daily_limit=1
    )
    device = register_unactivated(client)
    bind_test_device(client, device["deviceId"], account)
    database = client.app.state.db
    database.reserve_document(device["deviceId"], 1, account["id"])
    with pytest.raises(QuotaExceeded):
        database.reserve_document(device["deviceId"], 1, account["id"])


def _login(client: TestClient, settings: Settings) -> None:
    response = client.post(
        "/admin/api/login", json={"password": settings.admin_password}
    )
    assert response.status_code == 200, response.text


def test_admin_login_session_and_csrf(settings):
    client = TestClient(create_app(settings))
    assert client.get("/admin/api/session").json()["authenticated"] is False
    wrong = client.post(
        "/admin/api/login", json={"password": secrets.token_hex(16)}
    )
    assert wrong.status_code == 401

    _login(client, settings)
    session = client.get("/admin/api/session").json()
    assert session["authenticated"] is True
    assert session["adminEnabled"] is True

    no_csrf = client.post("/admin/api/accounts", json={"phone": "13900000009"})
    assert no_csrf.status_code == 403

    created = client.post(
        "/admin/api/accounts",
        json={
            "phone": "13900000009",
            "displayName": "同学 A",
            "aiPacksPerDay": 3,
            "audioMinutesPerDay": 20,
            "textCharactersPerDay": 1000,
            "documentsPerDay": 2,
            "maxDevices": 2,
            "validUntil": "2099-12-31",
        },
        headers={"X-Requested-With": "zhixi-admin"},
    )
    assert created.status_code == 201, created.text
    account = created.json()
    assert account["phone"] == "13900000009"
    assert account["phoneMasked"] == "139****0009"
    assert account["limits"]["aiPacksPerDay"] == 3

    listed = client.get("/admin/api/accounts", params={"query": "0009"}).json()
    assert listed["total"] == 1

    updated = client.patch(
        f"/admin/api/accounts/{account['id']}",
        json={
            "phone": "13900000009",
            "displayName": "同学 B",
            "aiPacksPerDay": 5,
            "audioMinutesPerDay": 30,
            "textCharactersPerDay": 2000,
            "documentsPerDay": 3,
            "maxDevices": 4,
            "validUntil": "2099-12-31",
        },
        headers={"X-Requested-With": "zhixi-admin"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["displayName"] == "同学 B"
    assert updated.json()["limits"]["aiPacksPerDay"] == 5

    unbound = client.post(
        f"/admin/api/accounts/{account['id']}/unbind",
        headers={"X-Requested-With": "zhixi-admin"},
    )
    assert unbound.status_code == 200
    assert unbound.json()["unbound"] == 0

    deleted = client.delete(
        f"/admin/api/accounts/{account['id']}",
        headers={"X-Requested-With": "zhixi-admin"},
    )
    assert deleted.status_code == 200
    assert client.get("/admin/api/accounts").json()["total"] == 0

    client.post(
        "/admin/api/logout", headers={"X-Requested-With": "zhixi-admin"}
    )
    assert client.get("/admin/api/session").json()["authenticated"] is False


def test_admin_batch_create_skips_duplicates_and_invalid(settings):
    client = TestClient(create_app(settings))
    _login(client, settings)
    headers = {"X-Requested-With": "zhixi-admin"}
    payload = {
        "phones": ["13900000010", "13900000011", "13900000010", "bad"],
        "validUntil": "2099-12-31",
    }
    response = client.post("/admin/api/accounts/batch", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["created"] == 2
    assert body["skipped"] == 1
    assert body["invalid"] == ["bad"]


def test_admin_overview_and_request_log(settings):
    client = make_client(settings, lambda request: chat_response(valid_package()))
    registered = register(client)
    headers = _bearer(registered["token"])
    assert client.get("/v1/accounts/me", headers=headers).status_code == 200
    assert client.get("/health").status_code == 200

    _login(client, settings)
    overview = client.get("/admin/api/overview", params={"days": 1})
    assert overview.status_code == 200, overview.text
    body = overview.json()
    assert body["totals"]["requests"] >= 1
    assert body["service"]["status"] == "ok"
    assert any(item["route"] == "/v1/accounts/me" for item in body["endpoints"])

    requests = client.get(
        "/admin/api/requests", params={"includePolling": True}
    ).json()
    routes = [item["route"] for item in requests["items"]]
    assert "/v1/accounts/me" in routes
    assert "/health" not in routes
    assert not any(route.startswith("/admin") for route in routes)
    assert all(item["accountId"] == registered["accountId"] for item in requests["items"])
    assert requests["items"][0]["accountName"] == "Test User"

    devices = client.get("/admin/api/devices", params={"scope": "all"}).json()
    assert devices["total"] >= 1
    assert devices["boundTotal"] >= 1


def test_admin_requests_hide_anonymous_and_polling_by_default(settings):
    client = make_client(settings, lambda request: chat_response(valid_package()))
    anonymous = register_unactivated(client)
    anonymous_headers = _bearer(anonymous["token"])
    assert client.get("/v1/accounts/me", headers=anonymous_headers).status_code == 200

    account, _ = create_test_account(client, phone="13900000021")
    bound = register_unactivated(client)
    bind_test_device(client, bound["deviceId"], account)
    bound_headers = _bearer(bound["token"])
    assert client.get("/v1/accounts/me", headers=bound_headers).status_code == 200

    _login(client, settings)
    default_rows = client.get("/admin/api/requests").json()["items"]
    assert default_rows == []

    unbound_rows = client.get(
        "/admin/api/requests",
        params={"includeUnbound": True, "includePolling": True},
    ).json()["items"]
    assert any(item["deviceId"] == anonymous["deviceId"] for item in unbound_rows)

    polling_rows = client.get(
        "/admin/api/requests",
        params={"accountId": account["id"], "includePolling": True},
    ).json()["items"]
    assert [item["route"] for item in polling_rows] == ["/v1/accounts/me"]
    assert polling_rows[0]["accountName"] == "Test User"

    assert client.get(
        "/admin/api/devices", params={"scope": "unbound"}
    ).json()["unboundTotal"] == 1
    assert client.get(
        "/admin/api/devices", params={"scope": "bound"}
    ).json()["boundTotal"] == 1


def test_admin_can_unbind_one_device_and_clean_anonymous_data(settings):
    client = TestClient(create_app(settings))
    _login(client, settings)
    csrf = {"X-Requested-With": "zhixi-admin"}
    account, phone = create_test_account(client, phone="13900000022")

    anonymous = register_unactivated(client)
    bound = register_unactivated(client)
    bind_test_device(client, bound["deviceId"], account)
    assert client.get(
        "/v1/accounts/me", headers=_bearer(bound["token"])
    ).status_code == 200

    accounts = client.get("/admin/api/accounts").json()["items"]
    payload = next(item for item in accounts if item["id"] == account["id"])
    assert payload["deviceCount"] == 1
    assert payload["devices"][0]["deviceId"] == bound["deviceId"]

    unbound_delete = client.delete(
        f"/admin/api/devices/{anonymous['deviceId']}", headers=csrf
    )
    assert unbound_delete.status_code == 200
    bound_delete = client.delete(
        f"/admin/api/devices/{bound['deviceId']}", headers=csrf
    )
    assert bound_delete.status_code == 409

    unbound = client.post(
        f"/admin/api/accounts/{account['id']}/unbind", headers=csrf
    )
    assert unbound.json()["unbound"] == 1
    assert client.delete(
        f"/admin/api/devices/{bound['deviceId']}", headers=csrf
    ).status_code == 200
    assert client.get("/admin/api/devices", params={"scope": "all"}).json()["total"] == 0

    # 清理接口：匿名设备、调用记录、验证码全部清空，账号本身保留。
    cleanup = client.post("/admin/api/maintenance/cleanup", headers=csrf)
    assert cleanup.status_code == 200, cleanup.text
    assert cleanup.json()["orphanSyncRecords"] >= 0
    assert client.get("/admin/api/accounts").json()["total"] == 1
    assert client.get("/admin/api/requests", params={"includeUnbound": True}).json()["total"] == 0


def test_admin_static_mount_serves_index_and_keeps_api(settings, tmp_path):
    dist = tmp_path / "admin-dist"
    dist.mkdir()
    (dist / "index.html").write_text(
        "<html><body>zhixi admin</body></html>", encoding="utf-8"
    )
    client = TestClient(create_app(replace(settings, admin_dist_dir=str(dist))))
    response = client.get("/admin/")
    assert response.status_code == 200
    assert "zhixi admin" in response.text
    assert response.headers["X-Frame-Options"] == "DENY"
    assert "Content-Security-Policy" in response.headers

    session = client.get("/admin/api/session")
    assert session.status_code == 200
    assert session.json()["adminEnabled"] is True
    assert client.get("/admin/lecsync/webhooks").status_code == 404
