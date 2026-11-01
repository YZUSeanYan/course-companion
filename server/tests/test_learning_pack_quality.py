"""学习包质量：数量预算、去重与 v3 提示词。"""

import asyncio
import json

import httpx

from app.v2_provider import ITEM_BUDGETS, V2Provider
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


def test_prompt_declares_v3_budgets_and_subject_adaptation(settings):
    seen: list = []
    asyncio.run(_provider(settings, _base_package(), seen).generate_learning_pack(_request()))
    prompt = json.dumps(seen[0], ensure_ascii=False)
    assert "at most 12 vocabulary, 6 phrases, 12 keyPoints, 8 questions, 10 quizCards" in prompt
    assert "technical or STEM material" in prompt
    assert "a phrase must not duplicate a vocabulary term" in prompt
