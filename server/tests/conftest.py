import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.provider import AIProvider


ALL_OUTPUTS = ["summary", "vocabulary", "phrases", "keyPoints", "questions", "quizCards"]


@pytest.fixture
def settings(tmp_path):
    return Settings(
        database_path=str(tmp_path / "test.db"),
        token_pepper="test-only-pepper",
        provider_base_url="https://1.1.1.1/v1",
        provider_model="mock-model",
        provider_api_key="test-only-key",
        provider_timeout_seconds=0.1,
        provider_max_retries=0,
        provider_retry_backoff_seconds=0,
        device_daily_quota=20,
        register_rate_limit=20,
        register_rate_window_seconds=60,
        analyze_rate_limit=50,
        analyze_rate_window_seconds=60,
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


def register(client):
    response = client.post("/v1/devices/register")
    assert response.status_code == 201, response.text
    return response.json()


def auth_headers(client):
    token = register(client)["token"]
    return {"Authorization": f"Bearer {token}"}
