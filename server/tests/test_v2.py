import json
import hashlib

import httpx

from app.v2_provider import V2Provider
from conftest import auth_headers, chat_response, make_client


def test_translate_success_and_cache(settings):
    calls = []

    def handler(request):
        calls.append(request)
        return chat_response("车床")

    client = make_client(settings, handler)
    client.app.state.v2_provider = V2Provider(settings, transport=httpx.MockTransport(handler))
    headers = auth_headers(client)
    payload = {"lineId": 7, "sourceText": "lathe", "sourceHash": hashlib.sha256(b"lathe").hexdigest(), "targetLang": "zh-CN"}
    first = client.post("/v2/translate", json=payload, headers=headers)
    second = client.post("/v2/translate", json=payload, headers=headers)

    assert first.status_code == 200, first.text
    assert first.json()["translation"] == "车床"
    assert first.json()["lineId"] == 7
    assert second.json()["translation"] == "车床"
    assert len(calls) == 1


def test_learning_pack_contains_minutes_and_manual_doubt_answers(settings):
    package = {
        "minutes": {
            "title": "Classroom minutes",
            "overview": "The class explained lathes.",
            "sections": [
                {"sectionKey": "concept", "title": "Lathe", "body": "A lathe removes material.", "order": 1, "sourceIds": ["page-1"]}
            ],
        },
        "doubtAnswers": [
            {"doubtId": "doubt-1", "answer": "Secure the workpiece first.", "sourceIds": ["page-1"]}
        ],
        "visualNotes": [],
        "vocabulary": [{"term": "lathe", "definitionZh": "车床", "definitionEn": "A machine tool", "example": "Use a lathe.", "sourceIds": ["page-1"]}],
        "phrases": [{"phrase": "remove material", "definitionZh": "去除材料", "definitionEn": "Cut material", "example": "Remove material.", "sourceIds": ["page-1"]}],
        "keyPoints": [{"text": "Safety comes first.", "sourceIds": ["page-1"]}],
        "questions": [{"question": "What is a lathe?", "answer": "A machine tool.", "sourceIds": ["page-1"]}],
        "quizCards": [{"front": "lathe", "back": "车床", "sourceIds": ["page-1"]}],
    }

    def handler(request):
        body = json.loads(request.content)
        prompt = body["messages"][1]["content"]
        assert "manualDoubts" in prompt
        return chat_response(package)

    client = make_client(settings, handler)
    client.app.state.v2_provider = V2Provider(settings, transport=httpx.MockTransport(handler))
    response = client.post(
        "/v2/learning-pack",
        headers=auth_headers(client),
        json={
            "courseName": "Manufacturing English",
            "language": "zh-en",
            "analysisMode": "SESSION",
            "chunks": [{"sourceId": "page-1", "text": "A lathe removes material.", "page": 1}],
            "manualDoubts": [{"doubtId": "doubt-1", "sourceText": "Why secure the workpiece?", "note": "I missed this."}],
        },
    )

    assert response.status_code == 200, response.text
    result = response.json()["package"]
    assert result["minutes"]["overview"] == "The class explained lathes."
    assert result["minutes"]["sections"] == []
    assert result["doubtAnswers"][0]["doubtId"] == "doubt-1"
    assert result["vocabulary"][0]["term"] == "lathe"


def test_visual_model_receives_image_and_returns_grounded_notes(settings, monkeypatch):
    monkeypatch.setenv("VISION_PROVIDER_BASE_URL", "https://1.1.1.1/v1")
    monkeypatch.setenv("VISION_PROVIDER_MODEL", "vision-mock")
    monkeypatch.setenv("VISION_PROVIDER_API_KEY", "test-only")
    package = {
        "minutes": {
            "title": "Diagram notes",
            "overview": "The diagram shows a closed process.",
            "sections": [{"sectionKey": "diagram", "title": "Process", "body": "Material flows from A to B.", "order": 1, "sourceIds": ["figure-1"]}],
        },
        "doubtAnswers": [],
        "visualNotes": [{"sourceId": "figure-1", "description": "A points to B.", "sourceIds": ["figure-1"]}],
        "vocabulary": [],
        "phrases": [],
        "keyPoints": [],
        "questions": [],
        "quizCards": [],
    }

    def handler(request):
        body = json.loads(request.content)
        content = body["messages"][0]["content"]
        assert any(item.get("type") == "image_url" for item in content)
        assert any("OCR context" in item.get("text", "") for item in content if item.get("type") == "text")
        return chat_response(package)

    client = make_client(settings, handler)
    client.app.state.v2_provider = V2Provider(settings, transport=httpx.MockTransport(handler))
    response = client.post(
        "/v2/learning-pack",
        headers=auth_headers(client),
        json={
            "courseName": "Engineering",
            "language": "en",
            "analysisMode": "MATERIAL",
            "chunks": [{"sourceId": "figure-1", "text": "Diagram", "page": 1}],
            "visualBlocks": [{"sourceId": "figure-1", "ocrText": "A -> B", "imageBase64": "A" * 40, "mimeType": "image/png"}],
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["package"]["visualNotes"][0]["description"] == "A points to B."

    monkeypatch.delenv("VISION_PROVIDER_BASE_URL")
    monkeypatch.delenv("VISION_PROVIDER_MODEL")
    monkeypatch.delenv("VISION_PROVIDER_API_KEY")
    client = make_client(settings, lambda request: chat_response({}))
    response = client.post(
        "/v2/learning-pack",
        headers=auth_headers(client),
        json={
            "courseName": "Engineering",
            "language": "en",
            "analysisMode": "MATERIAL",
            "chunks": [{"sourceId": "page-1", "text": "Diagram", "page": 1}],
            "visualBlocks": [{"sourceId": "figure-1", "ocrText": "A", "imageBase64": "A" * 40, "mimeType": "image/png"}],
        },
    )
    assert response.status_code == 503
    assert "OCR alone" in response.json()["detail"]
