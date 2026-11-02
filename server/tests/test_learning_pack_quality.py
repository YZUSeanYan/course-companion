"""学习包质量：数量预算、去重、简明上限与 v4 提示词。"""

import asyncio
import json
import time
from dataclasses import replace

import httpx

from app.v2_provider import ITEM_BUDGETS, TEXT_CAPS, V2Provider
from app.v2_schemas import LearningPackRequest
from conftest import chat_response


def _base_package() -> dict:
    return {
        "minutes": {
            "title": "工程导论",
            "overview": "讲解车床与进给率。",
            "sections": [
                {"sectionKey": "concept", "title": "车床", "body": "车床从旋转工件上切除材料。", "order": 0, "sourceIds": ["page-1"]}
            ],
        },
        "doubtAnswers": [],
        "visualNotes": [],
        "vocabulary": [],
        "phrases": [],
        "keyPoints": [],
        "questions": [],
        "quizCards": [],
    }


def _request() -> LearningPackRequest:
    return LearningPackRequest.model_validate({
        "courseName": "机械制造基础",
        "courseNature": "工科专业课",
        "language": "zh-en",
        "analysisMode": "MATERIAL",
        "chunks": [{"sourceId": "page-1", "text": "车床从旋转的工件上切除材料。进给率决定切削速度。", "page": 1}],
        "manualDoubts": [],
        "visualBlocks": [],
    })


def _provider(settings, content: dict, seen: list) -> V2Provider:
    def handler(request):
        seen.append(json.loads(request.content))
        return chat_response(content)

    return V2Provider(settings, transport=httpx.MockTransport(handler))


def test_over_budget_and_duplicate_items_are_trimmed(settings):
    package = _base_package()
    package["vocabulary"] = [
        {"term": f"术语{i}", "definitionZh": "释义", "definitionEn": "definition", "example": "例句", "sourceIds": ["page-1"]}
        for i in range(20)
    ] + [
        {"term": "术语0", "definitionZh": "重复", "definitionEn": "dup", "example": "dup", "sourceIds": ["page-1"]}
    ]
    package["phrases"] = [
        {"phrase": "术语3", "definitionZh": "与词汇重复", "definitionEn": "dup term", "example": "x", "sourceIds": ["page-1"]},
        {"phrase": "固定搭配A", "definitionZh": "搭配", "definitionEn": "collocation", "example": "y", "sourceIds": ["page-1"]},
    ]
    package["keyPoints"] = [
        {"text": "要点A", "sourceIds": ["page-1"]},
        {"text": "要点A", "sourceIds": ["page-1"]},
    ]
    seen: list = []
    result = asyncio.run(_provider(settings, package, seen).generate_learning_pack(_request()))
    assert len(result.vocabulary) == ITEM_BUDGETS["vocabulary"]
    assert [item.term for item in result.vocabulary].count("术语0") == 1
    assert [item.phrase for item in result.phrases] == ["固定搭配A"]
    assert [item.text for item in result.key_points] == ["要点A"]


def test_prompt_declares_v4_budgets_subject_adaptation_and_chinese(settings):
    seen: list = []
    asyncio.run(_provider(settings, _base_package(), seen).generate_learning_pack(_request()))
    prompt = json.dumps(seen[0], ensure_ascii=False)
    assert "at most 12 vocabulary, 6 phrases, 12 keyPoints, 8 questions, 10 quizCards" in prompt
    assert "technical or STEM material" in prompt
    assert "a phrase must not duplicate a vocabulary term" in prompt
    assert "No filler" in prompt
    assert "Simplified Chinese" in prompt
    assert "minutes overview <= 120 Chinese characters" in prompt


def test_long_prose_is_trimmed_to_concise_caps(settings):
    package = _base_package()
    package["minutes"]["overview"] = "摘要" * 300
    package["minutes"]["sections"] = [
        {"sectionKey": "concept", "title": "标题" * 40, "body": "正文" * 400, "order": 0, "sourceIds": ["page-1"]},
    ] * 10
    package["vocabulary"] = [{
        "term": "lathe", "definitionZh": "释义" * 200, "definitionEn": "definition " * 100,
        "example": "example " * 100, "sourceIds": ["page-1"],
    }]
    package["keyPoints"] = [{"text": "要点" * 200, "sourceIds": ["page-1"]}]
    package["questions"] = [{"question": "问题" * 100, "answer": "答案" * 200, "sourceIds": ["page-1"]}]
    package["quizCards"] = [{"front": "正面" * 100, "back": "背面" * 200, "sourceIds": ["page-1"]}]
    seen: list = []
    result = asyncio.run(_provider(settings, package, seen).generate_learning_pack(_request()))
    assert len(result.minutes.overview) <= TEXT_CAPS["minutes.overview"] + 1
    assert result.minutes.sections == []
    assert result.key_points
    assert len(result.key_points[0].text) <= TEXT_CAPS["keyPoints.text"] + 1
    assert len(result.vocabulary[0].definition_zh) <= TEXT_CAPS["vocabulary.definitionZh"] + 1
    assert len(result.vocabulary[0].example) <= TEXT_CAPS["vocabulary.example"] + 1
    assert len(result.key_points[0].text) <= TEXT_CAPS["keyPoints.text"] + 1
    assert len(result.questions[0].answer) <= TEXT_CAPS["questions.answer"] + 1
    assert len(result.quiz_cards[0].back) <= TEXT_CAPS["quizCards.back"] + 1


def test_missing_sources_are_filled_and_empty_items_are_dropped(settings):
    package = _base_package()
    package["vocabulary"] = [
        {"term": "lathe", "translation": "车床", "definition": "material removal", "example": "A lathe cuts.", "sourceIds": []},
        {"term": "empty", "sourceIds": ["page-1"]},
    ]
    package["keyPoints"] = [
        {"text": "", "sourceIds": ["page-1"]},
        {"text": "进给率决定表面质量。", "sourceIds": []},
    ]
    seen: list = []
    result = asyncio.run(_provider(settings, package, seen).generate_learning_pack(_request()))
    assert [item.term for item in result.vocabulary] == ["lathe"]
    assert result.vocabulary[0].source_ids == ["page-1"]
    assert result.vocabulary[0].definition_en
    assert [item.text for item in result.key_points] == ["进给率决定表面质量。"]
    assert result.key_points[0].source_ids == ["page-1"]


def test_output_language_source_is_forwarded_to_the_prompt(settings):
    request = LearningPackRequest.model_validate({
        "courseName": "机械制造基础",
        "courseNature": "工科专业课",
        "language": "zh-en",
        "outputLanguage": "source",
        "analysisMode": "MATERIAL",
        "chunks": [{"sourceId": "page-1", "text": "车床从旋转的工件上切除材料。", "page": 1}],
    })
    seen: list = []
    asyncio.run(_provider(settings, _base_package(), seen).generate_learning_pack(request))
    prompt = seen[0]["messages"][1]["content"]
    assert '"outputLanguage":"source"' in prompt
    assert "dominant language of the source material" in prompt
    assert "Simplified Chinese" not in prompt


def test_missing_key_points_are_derived_from_minutes_sections(settings):
    seen: list = []
    result = asyncio.run(_provider(settings, _base_package(), seen).generate_learning_pack(_request()))
    assert result.key_points
    assert len(result.key_points) <= 6
    assert result.key_points[0].source_ids == ["page-1"]
    assert "车床" in result.key_points[0].text


def test_parallel_pack_race_returns_fastest_valid_brand(settings, monkeypatch):
    monkeypatch.setenv("MIMO_API_KEY", "test-only-mimo")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-only-deepseek")
    monkeypatch.delenv("KIMI_API_KEY", raising=False)
    monkeypatch.setattr("app.provider.validate_provider_url", lambda url: url.rstrip("/") + "/chat/completions")
    models: list[str] = []

    class DelayTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request):
            body = json.loads(request.content)
            models.append(body["model"])
            await asyncio.sleep(0.5 if body["model"] == "deepseek-flash" else 0.05)
            content = json.dumps(_base_package(), ensure_ascii=False)
            return httpx.Response(
                200,
                request=request,
                json={"choices": [{"message": {"role": "assistant", "content": content}}]},
            )

    provider = V2Provider(
        replace(settings, provider_parallel=True),
        transport=DelayTransport(),
    )
    started = time.monotonic()
    result = asyncio.run(provider.generate_learning_pack(_request()))
    elapsed = time.monotonic() - started
    assert result.minutes.title == "工程导论"
    assert elapsed < 0.4
    assert "mimo-v2.6-flash" in models


def test_vision_failure_falls_back_to_text_ocr(settings, monkeypatch):
    for name in (
        "VISION_PROVIDER_BASE_URL",
        "VISION_PROVIDER_MODEL",
        "VISION_PROVIDER_API_KEY",
        "KIMI_API_KEY",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("MIMO_API_KEY", "test-only-mimo")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-only-deepseek")
    monkeypatch.setattr("app.v2_provider.validate_provider_url", lambda url: url.rstrip("/") + "/chat/completions")
    monkeypatch.setattr("app.provider.validate_provider_url", lambda url: url.rstrip("/") + "/chat/completions")
    seen: list = []

    def handler(request):
        body = json.loads(request.content)
        seen.append(body)
        if isinstance(body["messages"][0]["content"], list):
            return httpx.Response(503, request=request)
        return chat_response(_base_package())

    provider = V2Provider(settings, transport=httpx.MockTransport(handler))
    request = LearningPackRequest.model_validate({
        "courseName": "机械制造基础",
        "courseNature": "工科专业课",
        "language": "zh-en",
        "analysisMode": "MATERIAL",
        "chunks": [{"sourceId": "page-1", "text": "车床从旋转的工件上切除材料。", "page": 1}],
        "visualBlocks": [{
            "sourceId": "page-1",
            "ocrText": "车床示意图",
            "imageBase64": "A" * 32,
            "mimeType": "image/png",
        }],
    })
    result = asyncio.run(provider.generate_learning_pack(request))
    assert result.minutes.title == "工程导论"
    text_bodies = [body for body in seen if isinstance(body["messages"][0]["content"], str)]
    assert text_bodies
    assert "imageBase64" not in text_bodies[-1]["messages"][1]["content"]
    assert "无法确认" in text_bodies[-1]["messages"][1]["content"]
