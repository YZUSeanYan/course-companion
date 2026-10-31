import itertools
import json
import secrets

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.provider import AIProvider
from app.security import encrypt_account_phone, phone_digest


ALL_OUTPUTS = ["summary", "vocabulary", "phrases", "keyPoints", "questions", "quizCards"]
_phone_counter = itertools.count(1)
_TEST_PROVIDER_KEY = secrets.token_urlsafe(24)
_TEST_ADMIN_PASSWORD = secrets.token_urlsafe(24)
_TEST_ADMIN_SESSION_SECRET = secrets.token_urlsafe(24)
_TEST_ACCOUNT_ENCRYPTION_KEY = secrets.token_urlsafe(24)


@pytest.fixture
def settings(tmp_path):
    return Settings(
        database_path=str(tmp_path / "test.db"),
        token_pepper="test-only-pepper",
        provider_base_url="https://1.1.1.1/v1",
        provider_model="mock-model",
        provider_api_key=_TEST_PROVIDER_KEY,
        provider_timeout_seconds=0.1,
        provider_max_retries=0,
        provider_retry_backoff_seconds=0,
        device_daily_quota=20,
        register_rate_limit=20,
        register_rate_window_seconds=60,
        analyze_rate_limit=50,
        analyze_rate_window_seconds=60,
        require_account_activation=True,
        usage_timezone="Asia/Shanghai",
        account_encryption_key=_TEST_ACCOUNT_ENCRYPTION_KEY,
        account_default_ai_pack_daily_limit=20,
        account_default_audio_minutes_daily_limit=60,
        account_default_text_chars_daily_limit=50000,
        account_default_document_daily_limit=100,
        account_default_max_devices=10,
        admin_password=_TEST_ADMIN_PASSWORD,
        admin_session_secret=_TEST_ADMIN_SESSION_SECRET,
        admin_cookie_secure=False,
    )


@pytest.fixture
def payload():
    return {
        "courseName": "Biology confidential course name",
        "language": "en",
        "glossary": [{"term": "mitosis", "definition": "细胞分裂"}],
        "chunks": [
            {
                "sourceId": "slide-1",
                "text": "Confidential lecture body about mitosis.",
                "page": 2,
            },
            {
                "sourceId": "audio-1",
                "text": "Private subtitle body about chromosomes.",
                "startMs": 1000,
                "endMs": 2500,
            },
        ],
        "requestedOutputs": list(ALL_OUTPUTS),
    }


def valid_package(source_id="slide-1"):
    return {
        "summary": [{"text": "A summary", "sourceIds": [source_id]}],
        "vocabulary": [
            {
                "term": "mitosis",
                "definitionZh": "有丝分裂",
                "definitionEn": "A form of cell division",
                "example": "Mitosis produces two cells.",
                "sourceIds": [source_id],
            }
        ],
        "phrases": [
            {
                "phrase": "cell division",
                "definitionZh": "细胞分裂",
                "definitionEn": "Division of a cell",
                "example": "Cell division is regulated.",
                "sourceIds": [source_id],
            }
        ],
        "keyPoints": [{"text": "Two cells result", "sourceIds": [source_id]}],
        "questions": [
            {
                "question": "What results?",
                "answer": "Two cells",
                "sourceIds": [source_id],
            }
        ],
        "quizCards": [
            {"front": "Mitosis", "back": "Cell division", "sourceIds": [source_id]}
        ],
    }


def chat_response(content, status=200):
    if not isinstance(content, str):
        content = json.dumps(content, ensure_ascii=False)
    return httpx.Response(
        status,
        json={"choices": [{"message": {"role": "assistant", "content": content}}]},
    )


def make_client(settings, handler):
    app = create_app(settings)
    app.state.provider = AIProvider(
        settings, transport=httpx.MockTransport(handler)
    )
    return TestClient(app)


def register(client, activate: bool = True):
    response = client.post("/v1/devices/register")
    assert response.status_code == 201, response.text
    body = response.json()
    if activate:
        account, phone = create_test_account(client)
        bind_test_device(client, body["deviceId"], account)
        body["accountId"] = account["id"]
        body["phone"] = phone
    return body


def register_unactivated(client):
    return register(client, activate=False)


def create_test_account(client, phone: str | None = None, **overrides):
    database = client.app.state.db
    settings = client.app.state.settings
    phone = phone or f"138{next(_phone_counter):08d}"
    values = {
        "phone_hash": phone_digest(phone, settings.token_pepper),
        "phone_ciphertext": encrypt_account_phone(phone, settings.account_key),
        "display_name": "Test User",
        "note": "",
        "valid_until": None,
        "ai_pack_daily_limit": settings.account_default_ai_pack_daily_limit,
        "audio_minutes_daily_limit": settings.account_default_audio_minutes_daily_limit,
        "text_chars_daily_limit": settings.account_default_text_chars_daily_limit,
        "document_daily_limit": settings.account_default_document_daily_limit,
        "max_devices": settings.account_default_max_devices,
    }
    values.update(overrides)
    return database.create_account(**values), phone


def bind_test_device(client, device_id: str, account: dict) -> None:
    client.app.state.db.bind_device(
        account["id"], device_id, int(account["max_devices"])
    )


def auth_headers(client, activate: bool = True):
    token = register(client, activate=activate)["token"]
    return {"Authorization": f"Bearer {token}"}
