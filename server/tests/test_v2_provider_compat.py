import json
import asyncio

import httpx
import pytest

from app.provider import ProviderInvalidResponse
from app.provider_catalog import ProviderEndpoint
from app.v2_provider import V2Provider
from app.v2_schemas import LearningPackRequest, TranslateRequest
from conftest import chat_response


def valid_package():
    return {
        "minutes": {
            "title": "Lathe study notes",
            "overview": "The class explained lathes.",
            "sections": [{"sectionKey": "concept", "title": "Lathe", "body": "A lathe removes material.", "order": 0, "sourceIds": ["page-1"]}],
        },
        "doubtAnswers": [],
        "visualNotes": [],
        "vocabulary": [],
        "phrases": [],
        "keyPoints": [],
        "questions": [],
        "quizCards": [],
    }


def request_model():
    return LearningPackRequest.model_validate({
        "courseName": "Manufacturing English",
        "courseNature": "Engineering vocabulary",
        "language": "zh-en",
        "analysisMode": "MATERIAL",
        "chunks": [{"sourceId": "page-1", "text": "A lathe removes material.", "page": 1}],
        "manualDoubts": [],
        "visualBlocks": [],
    })


def test_kimi_uses_documented_temperature(settings, monkeypatch):
    monkeypatch.setenv("KIMI_API_KEY", "test-only-kimi")
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("MIMO_API_KEY", raising=False)
    monkeypatch.setattr("app.provider.validate_provider_url", lambda url: url + "/chat/completions")
    seen = []

    def handler(request):
        seen.append(json.loads(request.content))
        return chat_response("OK")

    provider = V2Provider(settings, transport=httpx.MockTransport(handler))
    translation_request = TranslateRequest(lineId=1, sourceText="lathe", sourceHash="a" * 64, targetLang="zh-CN")
    result = asyncio.run(provider.translate(translation_request))
    assert result == "OK"
    assert seen[0]["temperature"] == 1


def test_provider_aliases_are_normalized_without_relaxing_sources(settings):
    content = valid_package() | {
        "vocabulary": [{"en": "lathe", "zh": "车床", "definition": "A machine tool. 车床。", "example": "A lathe removes material.", "sourceId": "page-1"}],
        "phrases": [{"phrase": "remove material", "translation": "去除材料", "usage": "Material removal in machining.", "example": "A lathe removes material.", "sourceIds": ["page-1"]}],
        "keyPoints": [{"pointEn": "A lathe removes material.", "sourceIds": ["page-1"]}],
        "questions": [{"questionEn": "What does a lathe do?", "answerEn": "It removes material.", "difficulty": "easy", "sourceIds": ["page-1"]}],
    }
    provider = V2Provider(settings, transport=httpx.MockTransport(lambda request: chat_response(content)))
    result = asyncio.run(provider.generate_learning_pack(request_model()))
    assert result.vocabulary[0].term == "lathe"
    assert result.vocabulary[0].definition_en
    assert result.phrases[0].definition_en == "Material removal in machining."
    assert result.key_points[0].text == "A lathe removes material."
    assert result.questions[0].question == "What does a lathe do?"


def test_invalid_provider_output_gets_one_schema_repair(settings):
    calls = []
    invalid = valid_package()
    invalid["visualNotes"] = [{
        "sourceId": "figure-x",
        "description": "A lathe removes material.",
        "sourceIds": ["unknown-page"],
    }]

    def handler(request):
        calls.append(request)
        return chat_response(invalid if len(calls) == 1 else valid_package())

    provider = V2Provider(settings, transport=httpx.MockTransport(handler))
    result = asyncio.run(provider.generate_learning_pack(request_model()))
    assert result.minutes.title == "Lathe study notes"
    assert len(calls) == 2


def test_invalid_output_fails_over_after_one_repair(settings, monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek")
    monkeypatch.setenv("KIMI_API_KEY", "test-kimi")
    monkeypatch.setenv("MIMO_API_KEY", "test-mimo")
    monkeypatch.setattr("app.provider.validate_provider_url", lambda url: url + "/chat/completions")
    calls = []

    def handler(request):
        payload = json.loads(request.content)
        calls.append(payload)
        if payload["model"] == "deepseek-flash":
            return chat_response("not valid JSON")
        return chat_response(valid_package())

    provider = V2Provider(settings, transport=httpx.MockTransport(handler))
    result = asyncio.run(provider.generate_learning_pack(request_model()))

    assert result.minutes.title == "Lathe study notes"
    assert [call["model"] for call in calls] == [
        "deepseek-flash",
        "deepseek-flash",
        "k3.1-pro-highspeed",
    ]
    assert [call["temperature"] for call in calls] == [0.2, 0.2, 1]
    assert calls[1]["messages"][-2]["content"] == "not valid JSON"


def test_all_invalid_outputs_have_bounded_requests(settings, monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek")
    monkeypatch.setenv("KIMI_API_KEY", "test-kimi")
    monkeypatch.setenv("MIMO_API_KEY", "test-mimo")
    monkeypatch.setattr("app.provider.validate_provider_url", lambda url: url + "/chat/completions")
    calls = []

    def handler(request):
        calls.append(json.loads(request.content))
        return chat_response("not valid JSON")

    provider = V2Provider(settings, transport=httpx.MockTransport(handler))
    with pytest.raises(ProviderInvalidResponse) as caught:
        asyncio.run(provider.generate_learning_pack(request_model()))

    assert [call["model"] for call in calls] == [
        "deepseek-flash",
        "deepseek-flash",
        "k3.1-pro-highspeed",
        "k3.1-pro-highspeed",
        "mimo-v2.6-flash",
        "mimo-v2.6-flash",
    ]
    assert len(calls) == 6
    assert str(caught.value) == "AI provider returned invalid v2 learning minutes after one repair"
    for secret in ("test-deepseek", "test-kimi", "test-mimo"):
        assert secret not in str(caught.value)


def test_vision_falls_back_from_mimo_to_deepseek_using_existing_keys(settings, monkeypatch):
    for name in (
        "VISION_PROVIDER_BASE_URL",
        "VISION_PROVIDER_MODEL",
        "VISION_PROVIDER_API_KEY",
        "KIMI_API_KEY",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("MIMO_API_KEY", "test-only-mimo")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-only-deepseek")
    monkeypatch.setattr("app.v2_provider.validate_provider_url", lambda url: url + "/chat/completions")
    seen_models = []

    def handler(request):
        body = json.loads(request.content)
        seen_models.append(body["model"])
        if body["model"] == "mimo-v2.6-pro":
            return httpx.Response(503, json={"error": {"message": "temporarily unavailable"}})
        package = valid_package() | {
            "visualNotes": [{"sourceId": "figure-1", "description": "A points to B.", "sourceIds": ["figure-1"]}],
        }
        return chat_response(package)

    provider = V2Provider(settings, transport=httpx.MockTransport(handler))
    request = LearningPackRequest.model_validate({
        "courseName": "Manufacturing English",
        "courseNature": "Engineering vocabulary",
        "language": "zh-en",
        "analysisMode": "MATERIAL",
        "chunks": [{"sourceId": "page-1", "text": "A lathe removes material.", "page": 1}],
        "manualDoubts": [],
        "visualBlocks": [{
            "sourceId": "figure-1",
            "ocrText": "A -> B",
            "imageBase64": "A" * 32,
            "mimeType": "image/png",
        }],
    })
    result = asyncio.run(provider.generate_learning_pack(request))
    assert seen_models == ["mimo-v2.6-pro", "deepseek-flash"]
    assert provider.model_used == "deepseek-flash"
    assert result.visual_notes[0].description == "A points to B."


def test_vision_falls_back_when_first_provider_keeps_returning_invalid_schema(settings, monkeypatch):
    for name in (
        "VISION_PROVIDER_BASE_URL",
        "VISION_PROVIDER_MODEL",
        "VISION_PROVIDER_API_KEY",
        "KIMI_API_KEY",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("MIMO_API_KEY", "test-only-mimo")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-only-deepseek")
    monkeypatch.setattr("app.v2_provider.validate_provider_url", lambda url: url + "/chat/completions")
    seen_models = []

    def handler(request):
        body = json.loads(request.content)
        seen_models.append(body["model"])
        if body["model"] == "mimo-v2.6-pro":
            return chat_response("not valid JSON")
        package = valid_package() | {
            "visualNotes": [{"sourceId": "figure-1", "description": "A points to B.", "sourceIds": ["figure-1"]}],
        }
        return chat_response(package)

    provider = V2Provider(settings, transport=httpx.MockTransport(handler))
    request = LearningPackRequest.model_validate({
        "courseName": "Manufacturing English",
        "courseNature": "Engineering vocabulary",
        "language": "zh-en",
        "analysisMode": "MATERIAL",
        "chunks": [{"sourceId": "page-1", "text": "A lathe removes material.", "page": 1}],
        "manualDoubts": [],
        "visualBlocks": [{
            "sourceId": "figure-1",
            "ocrText": "A -> B",
            "imageBase64": "A" * 32,
            "mimeType": "image/png",
        }],
    })
    result = asyncio.run(provider.generate_learning_pack(request))
    assert seen_models == ["mimo-v2.6-pro", "mimo-v2.6-pro", "deepseek-flash"]
    assert provider.model_used == "deepseek-flash"
    assert result.visual_notes[0].description == "A points to B."
