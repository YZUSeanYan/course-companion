from __future__ import annotations

import secrets
from dataclasses import replace
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.security import phone_digest, sms_code_digest
from app.trial_routes import _add_months

SMS_ACCESS_KEY_ID = secrets.token_hex(8)
SMS_ACCESS_KEY_SECRET = secrets.token_hex(16)


class FakeSmsSender:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []

    async def send_code(self, phone: str, code: str) -> None:
        self.sent.append((phone, code))


def trial_settings(base):
    return replace(
        base,
        aliyun_sms_access_key_id=SMS_ACCESS_KEY_ID,
        aliyun_sms_access_key_secret=SMS_ACCESS_KEY_SECRET,
        aliyun_sms_sign_name="test-sign",
        aliyun_sms_template_code="SMS_TEST",
        trial_default_ai_packs=5,
        trial_default_audio_minutes=30,
        trial_default_valid_months=2,
        account_default_text_chars_daily_limit=20000,
        account_default_document_daily_limit=5,
        account_default_max_devices=3,
        trial_code_resend_seconds=60,
        trial_code_per_phone_hour=20,
        trial_code_per_ip_hour=100,
        trial_apply_per_ip_hour=100,
    )


def make_trial_client(settings):
    client = TestClient(create_app(trial_settings(settings)))
    fake = FakeSmsSender()
    client.app.state.sms_sender = fake
    return client, fake


def request_code(client, phone):
    return client.post("/v1/trial/request-code", json={"phone": phone})


def apply_trial(client, phone, code, *, name="张同学", nickname="小张", consent=True):
    return client.post(
        "/v1/trial/apply",
        json={
            "phone": phone,
            "code": code,
            "name": name,
            "nickname": nickname,
            "consent": consent,
        },
    )


def test_request_code_and_apply_creates_account_with_defaults(settings):
    client, fake = make_trial_client(settings)
    phone = "13900000101"
    response = request_code(client, phone)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["sent"] is True
    assert body["phoneMasked"] == "139****0101"
    assert fake.sent and fake.sent[-1][0] == phone
    code = fake.sent[-1][1]
    assert len(code) == 6 and code.isdigit()

    with client.app.state.db.connect() as connection:
        row = connection.execute(
            "SELECT code_hash, consumed_at FROM sms_verification_codes"
        ).fetchone()
    assert row["consumed_at"] is None
    assert code not in row["code_hash"]
    assert row["code_hash"] == sms_code_digest(
        phone, code, client.app.state.settings.token_pepper
    )

    applied = apply_trial(client, phone, code)
    assert applied.status_code == 201, applied.text
    result = applied.json()
    expected_valid_until = _add_months(
        date.fromisoformat(client.app.state.db.today()), 2
    ).isoformat()
    assert result["validUntil"] == expected_valid_until
    assert result["limits"] == {
        "aiPacksPerDay": 5,
        "audioMinutesPerDay": 30,
        "textCharactersPerDay": 20000,
        "documentsPerDay": 5,
        "maxDevices": 3,
    }

    account = client.app.state.db.account_by_phone_hash(
        phone_digest(phone, client.app.state.settings.token_pepper)
    )
    assert account is not None
    assert account["display_name"] == "小张"
    assert "张同学" in account["note"]
    assert account["ai_pack_daily_limit"] == 5
    assert account["audio_minutes_daily_limit"] == 30
    assert account["text_chars_daily_limit"] == 20000
    assert account["document_daily_limit"] == 5
    assert account["max_devices"] == 3
    assert phone not in account["phone_ciphertext"]

    with client.app.state.db.connect() as connection:
        application_count = connection.execute(
            "SELECT COUNT(*) AS total FROM trial_applications"
        ).fetchone()["total"]
    assert application_count == 1


def test_wrong_code_is_bounded(settings):
    client, fake = make_trial_client(settings)
    phone = "13900000102"
    assert request_code(client, phone).status_code == 200
    code = fake.sent[-1][1]
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(4):
        assert apply_trial(client, phone, wrong).status_code == 400
    fifth = apply_trial(client, phone, wrong)
    assert fifth.status_code == 400
    assert "还可尝试 0 次" in fifth.json()["detail"]

    exhausted = apply_trial(client, phone, code)
    assert exhausted.status_code == 429
    assert exhausted.headers["X-Zhixi-Error-Code"] == "too_many_attempts"


def test_cooldown_existing_phone_and_consent(settings):
    client, fake = make_trial_client(settings)
    phone = "13900000103"
    assert request_code(client, phone).status_code == 200
    cooldown = request_code(client, phone)
    assert cooldown.status_code == 429
    assert cooldown.headers["X-Zhixi-Error-Code"] == "cooldown"

    code = fake.sent[-1][1]
    assert apply_trial(client, phone, code, consent=False).status_code == 422
    assert apply_trial(client, phone, code).status_code == 201
    assert request_code(client, phone).status_code == 409


def test_invalid_phone_and_unconfigured_sms(settings):
    client, _ = make_trial_client(settings)
    assert request_code(client, "12345").status_code == 422
    configured = client.get("/v1/trial/status").json()
    assert configured["smsConfigured"] is True
    assert configured["defaults"]["aiPacksPerDay"] == 5

    unconfigured = TestClient(create_app(settings))
    status = unconfigured.get("/v1/trial/status").json()
    assert status["smsConfigured"] is False
    response = request_code(unconfigured, "13900000104")
    assert response.status_code == 503
    assert response.headers["X-Zhixi-Error-Code"] == "sms_not_configured"


def test_expired_code_is_rejected(settings):
    client, fake = make_trial_client(settings)
    phone = "13900000105"
    assert request_code(client, phone).status_code == 200
    code = fake.sent[-1][1]
    with client.app.state.db.connect() as connection:
        connection.execute(
            "UPDATE sms_verification_codes SET expires_at = ?",
            ("2000-01-01T00:00:00+00:00",),
        )
    response = apply_trial(client, phone, code)
    assert response.status_code == 400
    assert response.headers["X-Zhixi-Error-Code"] == "code_expired"


def test_admin_sees_self_service_name_and_nickname(settings):
    client, fake = make_trial_client(settings)
    phone = "13900000106"
    assert request_code(client, phone).status_code == 200
    assert apply_trial(
        client, phone, fake.sent[-1][1], name="李同学", nickname="小李"
    ).status_code == 201
    login = client.post(
        "/admin/api/login", json={"password": settings.admin_password}
    )
    assert login.status_code == 200
    accounts = client.get("/admin/api/accounts").json()["items"]
    account = next(item for item in accounts if item["phone"] == phone)
    assert account["displayName"] == "小李"
    assert "李同学" in account["note"]
    assert account["limits"]["aiPacksPerDay"] == 5
    assert account["limits"]["audioMinutesPerDay"] == 30
