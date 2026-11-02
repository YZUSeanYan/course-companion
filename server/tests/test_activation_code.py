from __future__ import annotations

import secrets
from dataclasses import replace

from fastapi.testclient import TestClient

from app.main import create_app
from app.security import activation_code_digest
from conftest import create_test_account

SMS_ACCESS_KEY_ID = secrets.token_hex(8)
SMS_ACCESS_KEY_SECRET = secrets.token_hex(16)


class FakeSmsSender:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []
        self.fail = False

    async def send_code(self, phone: str, code: str) -> None:
        if self.fail:
            raise RuntimeError("simulated delivery outage")
        self.sent.append((phone, code))


def activation_settings(base):
    return replace(
        base,
        aliyun_sms_access_key_id=SMS_ACCESS_KEY_ID,
        aliyun_sms_access_key_secret=SMS_ACCESS_KEY_SECRET,
        aliyun_sms_sign_name="test-sign",
        aliyun_sms_template_code="SMS_TEST",
    )


def make_client(settings):
    client = TestClient(create_app(activation_settings(settings)))
    fake = FakeSmsSender()
    client.app.state.sms_sender = fake
    return client, fake


def register_device(client) -> tuple[str, str]:
    response = client.post("/v1/devices/register")
    assert response.status_code == 201, response.text
    body = response.json()
    return body["deviceId"], body["token"]


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def request_code(client, token: str, phone: str):
    return client.post(
        "/v1/accounts/activate/request-code",
        json={"phone": phone},
        headers=bearer(token),
    )


def activate(client, token: str, phone: str, code: str | None = None):
    body = {"phone": phone}
    if code is not None:
        body["code"] = code
    return client.post("/v1/accounts/activate", json=body, headers=bearer(token))


def test_request_code_sends_and_stores_digest_only(settings):
    client, fake = make_client(settings)
    account, phone = create_test_account(client)
    device_id, token = register_device(client)

    response = request_code(client, token, phone)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["sent"] is True
    assert body["phoneMasked"] == phone[:3] + "****" + phone[-4:]
    assert body["cooldownSeconds"] == 60
    assert fake.sent and fake.sent[-1][0] == phone
    code = fake.sent[-1][1]
    assert len(code) == 6 and code.isdigit()

    with client.app.state.db.connect() as connection:
        row = connection.execute(
            "SELECT code_hash, consumed_at, device_id FROM activation_codes"
        ).fetchone()
    assert row["consumed_at"] is None
    assert row["device_id"] == device_id
    assert code not in row["code_hash"]
    assert row["code_hash"] == activation_code_digest(
        phone, code, settings.token_pepper
    )
    assert account["id"]


def test_request_code_cooldown_returns_429(settings):
    client, _ = make_client(settings)
    _, phone = create_test_account(client)
    _, token = register_device(client)

    assert request_code(client, token, phone).status_code == 200
    cooldown = request_code(client, token, phone)
    assert cooldown.status_code == 429
    assert cooldown.headers["X-Zhixi-Error-Code"] == "cooldown"
    assert "秒后再获取验证码" in cooldown.json()["detail"]
    assert int(cooldown.headers["Retry-After"]) > 0


def test_request_code_unknown_phone_returns_404(settings):
    client, _ = make_client(settings)
    _, token = register_device(client)
    response = request_code(client, token, "13900009999")
    assert response.status_code == 404
    assert response.headers["X-Zhixi-Error-Code"] == "account_not_found"


def test_request_code_rejects_invalid_phone(settings):
    client, _ = make_client(settings)
    _, token = register_device(client)
    response = request_code(client, token, "12345")
    assert response.status_code == 422
    assert response.headers["X-Zhixi-Error-Code"] == "invalid_phone"


def test_request_code_disabled_account_returns_403(settings):
    client, _ = make_client(settings)
    account, phone = create_test_account(client)
    client.app.state.db.update_account(account["id"], {"status": "disabled"})
    _, token = register_device(client)

    response = request_code(client, token, phone)
    assert response.status_code == 403
    assert response.headers["X-Zhixi-Error-Code"] == "account_disabled"


def test_request_code_expired_account_returns_403(settings):
    client, _ = make_client(settings)
    _, phone = create_test_account(client, valid_until="2000-01-01")
    _, token = register_device(client)

    response = request_code(client, token, phone)
    assert response.status_code == 403
    assert response.headers["X-Zhixi-Error-Code"] == "account_expired"


def test_request_code_without_sms_config_returns_503(settings):
    # Base settings carry no Aliyun credentials, so app.state.sms_sender is None.
    client = TestClient(create_app(settings))
    _, phone = create_test_account(client)
    _, token = register_device(client)

    response = request_code(client, token, phone)
    assert response.status_code == 503
    assert response.headers["X-Zhixi-Error-Code"] == "sms_not_configured"


def test_request_code_per_device_rate_limit(settings):
    limited = activation_settings(replace(settings, activation_code_per_device_hour=1))
    client = TestClient(create_app(limited))
    fake = FakeSmsSender()
    client.app.state.sms_sender = fake

    _, phone_a = create_test_account(client)
    _, phone_b = create_test_account(client)
    _, token = register_device(client)

    assert request_code(client, token, phone_a).status_code == 200
    limited_response = request_code(client, token, phone_b)
    assert limited_response.status_code == 429
    assert limited_response.headers["X-Zhixi-Error-Code"] == "rate_limited"


def test_request_code_sms_failure_invalidates_code(settings):
    client, fake = make_client(settings)
    _, phone = create_test_account(client)
    _, token = register_device(client)
    fake.fail = True

    response = request_code(client, token, phone)
    assert response.status_code == 503
    assert response.headers["X-Zhixi-Error-Code"] == "sms_delivery_failed"
    with client.app.state.db.connect() as connection:
        row = connection.execute(
            "SELECT consumed_at FROM activation_codes"
        ).fetchone()
    assert row["consumed_at"] is not None


def test_activate_with_code_succeeds_and_consumes(settings):
    client, fake = make_client(settings)
    _, phone = create_test_account(client)
    _, token = register_device(client)
    assert request_code(client, token, phone).status_code == 200
    code = fake.sent[-1][1]

    response = activate(client, token, phone, code)
    assert response.status_code == 200, response.text
    assert response.json()["activated"] is True

    with client.app.state.db.connect() as connection:
        row = connection.execute(
            "SELECT consumed_at FROM activation_codes"
        ).fetchone()
    assert row["consumed_at"] is not None

    # The consumed code cannot be reused by another device.
    _, second_token = register_device(client)
    reused = activate(client, second_token, phone, code)
    assert reused.status_code == 400
    assert reused.headers["X-Zhixi-Error-Code"] == "invalid_code"


def test_activate_wrong_code_counts_remaining_then_429(settings):
    client, fake = make_client(settings)
    _, phone = create_test_account(client)
    _, token = register_device(client)
    assert request_code(client, token, phone).status_code == 200
    code = fake.sent[-1][1]
    wrong = "000000" if code != "000000" else "111111"

    for remaining in (4, 3, 2, 1, 0):
        response = activate(client, token, phone, wrong)
        assert response.status_code == 400, response.text
        assert response.headers["X-Zhixi-Error-Code"] == "wrong_code"
        assert f"还可尝试 {remaining} 次" in response.json()["detail"]

    exhausted = activate(client, token, phone, code)
    assert exhausted.status_code == 429
    assert exhausted.headers["X-Zhixi-Error-Code"] == "too_many_attempts"


def test_activate_expired_code_returns_400(settings):
    client, fake = make_client(settings)
    _, phone = create_test_account(client)
    _, token = register_device(client)
    assert request_code(client, token, phone).status_code == 200
    code = fake.sent[-1][1]
    with client.app.state.db.connect() as connection:
        connection.execute(
            "UPDATE activation_codes SET expires_at = ?",
            ("2000-01-01T00:00:00+00:00",),
        )

    response = activate(client, token, phone, code)
    assert response.status_code == 400
    assert response.headers["X-Zhixi-Error-Code"] == "code_expired"


def test_activate_code_bound_to_phone(settings):
    client, fake = make_client(settings)
    _, phone_a = create_test_account(client)
    _, phone_b = create_test_account(client)
    _, token = register_device(client)
    assert request_code(client, token, phone_a).status_code == 200
    code = fake.sent[-1][1]

    # The code was issued for phone_a; using it with phone_b cannot match.
    response = activate(client, token, phone_b, code)
    assert response.status_code == 400
    assert response.headers["X-Zhixi-Error-Code"] == "invalid_code"
    with client.app.state.db.connect() as connection:
        row = connection.execute(
            "SELECT consumed_at, attempts FROM activation_codes"
        ).fetchone()
    assert row["consumed_at"] is None
    assert row["attempts"] == 0


def test_activate_requires_code_when_enforced(settings):
    client, _ = make_client(replace(settings, require_activation_code=True))
    _, phone = create_test_account(client)
    _, token = register_device(client)

    response = activate(client, token, phone)
    assert response.status_code == 403
    assert response.headers["X-Zhixi-Error-Code"] == "activation_code_required"
    assert "验证码" in response.json()["detail"]


def test_activate_without_code_rejected_even_if_legacy_flag_is_disabled(settings):
    # A deployment setting cannot re-enable code-free account takeover.
    client, _ = make_client(replace(settings, require_activation_code=False))
    _, phone = create_test_account(client)
    device_id, token = register_device(client)

    response = activate(client, token, phone)
    assert response.status_code == 403
    assert response.headers["X-Zhixi-Error-Code"] == "activation_code_required"
    assert client.app.state.db.account_for_device(device_id) is None
