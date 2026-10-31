from __future__ import annotations

import json
import os

import httpx
from pydantic import ValidationError

from .provider import AIProvider, ProviderError, ProviderInvalidResponse, ProviderUnavailable, validate_provider_url
from .provider_catalog import vision_endpoints_from_env
from .v2_schemas import LearningPackRequest, LearningPackV2, TranslateRequest

PROMPT_VERSION_V2 = "learning-minutes-v2"
SCHEMA_VERSION_V2 = "2.0"


def _alias(item: dict, *names: str, default=""):
    for name in names:
        value = item.get(name)
        if value is not None and value != "":
            return value
    return default


def _source_ids(item: dict) -> list[str]:
    value = _alias(item, "sourceIds", "sourceId", "source_ids", default=[])
    if isinstance(value, str):
        return [value] if value else []
    return value if isinstance(value, list) else []


def _english_definition(item: dict, *text_names: str) -> str:
    value = _alias(item, "definitionEn", "englishDefinition", "definition_en", "meaningEn", "definitionEN")
    if value:
        return str(value)
    for name in text_names:
        text = item.get(name)
        if isinstance(text, str):
            latin = sum(char.isascii() and char.isalpha() for char in text)
            letters = sum(char.isalpha() for char in text)
            if letters and latin / letters >= 0.5:
                return text
    return ""


def _normalize_learning_pack(data: dict) -> dict:
    """Adapt common provider aliases without relaxing schema or source validation."""
    pack = dict(data)
    pack["vocabulary"] = [
        {
            "term": _alias(item, "term", "en", "word", "expression"),
            "definitionZh": _alias(item, "definitionZh", "translation", "zh", "chinese", "definition", "meaning"),
            "definitionEn": _english_definition(item, "definition", "meaning", "definitionZh"),
            "example": _alias(item, "example", "exampleSentence", "sentence"),
            "sourceIds": _source_ids(item),
        }
        for item in pack.get("vocabulary", [])
        if isinstance(item, dict)
    ]
    pack["phrases"] = [
        {
            "phrase": _alias(item, "phrase", "expression", "text"),
            "definitionZh": _alias(item, "definitionZh", "translation", "zh", "definition", "meaning"),
            "definitionEn": _english_definition(item, "usage", "definition", "meaning", "definitionZh"),
            "example": _alias(item, "example", "exampleSentence", "sentence"),
            "sourceIds": _source_ids(item),
        }
        for item in pack.get("phrases", [])
        if isinstance(item, dict)
    ]
    for name in ("keyPoints", "questions", "quizCards"):
        normalized = []
        for item in pack.get(name, []):
            if not isinstance(item, dict):
                continue
            if name == "keyPoints":
                normalized.append({"text": _alias(item, "text", "pointEn", "pointZh", "point", "contentEn", "contentZh", "content"), "sourceIds": _source_ids(item)})
            elif name == "questions":
                normalized.append({
                    "question": _alias(item, "questionEn", "questionZh", "question", "front", "prompt"),
                    "answer": _alias(item, "answerEn", "answerZh", "answer", "back", "explanation"),
                    "sourceIds": _source_ids(item),
                })
            else:
                normalized.append({
                    "front": _alias(item, "front", "frontEn", "frontZh", "questionEn", "questionZh", "question", "prompt"),
                    "back": _alias(item, "back", "backEn", "backZh", "answerEn", "answerZh", "answer", "explanation"),
                    "sourceIds": _source_ids(item),
                })
        pack[name] = normalized
    pack["doubtAnswers"] = [
        {
            "doubtId": _alias(item, "doubtId", "id"),
            "answer": _alias(item, "answerEn", "answerZh", "answer", "text", "content"),
            "sourceIds": _source_ids(item),
        }
        for item in pack.get("doubtAnswers", [])
        if isinstance(item, dict)
    ]
    pack["visualNotes"] = [
        {
            "sourceId": _alias(item, "sourceId", "source_id"),
            "description": _alias(item, "description", "text", "content"),
            "sourceIds": _source_ids(item),
        }
        for item in pack.get("visualNotes", [])
        if isinstance(item, dict)
    ]
    if isinstance(pack.get("minutes"), dict):
        minutes = dict(pack["minutes"])
        sections = []
        for index, section in enumerate(minutes.get("sections", [])):
            if isinstance(section, dict):
                sections.append({
                    "sectionKey": _alias(section, "sectionKey", "key", default=f"section-{index + 1}"),
                    "title": _alias(section, "title", "heading"),
                    "body": _alias(section, "body", "content", "text"),
                    "order": _alias(section, "order", "index", default=index),
                    "sourceIds": _source_ids(section),
                })
        minutes["sections"] = sections
        pack["minutes"] = minutes
    return pack


class V2Provider(AIProvider):
    def __init__(self, settings, transport=None):
        super().__init__(settings, transport=transport)
        self.vision_transport = transport

    async def translate(self, request: TranslateRequest) -> str:
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a precise classroom translator. Translate naturally and faithfully. "
                    "Preserve formulas, identifiers and uncertainty. Return only the translation, "
                    "without notes or quotes."
                ),
            },
            {
                "role": "user",
                "content": f"Translate to {request.target_lang}:\n{request.source_text}",
            },
        ]
        return (await self._request_chat(messages)).strip().strip('"').strip()

    async def generate_learning_pack(self, request: LearningPackRequest) -> LearningPackV2:
        mode_instructions = {
            "SESSION": "Create meeting-style classroom minutes, including topics, explanations and review actions.",
            "MATERIAL": "Create study notes from the document, not fictional meeting decisions or attendees.",
            "EXAM": "Create exam revision notes and contextual vocabulary. Do not invent meeting decisions.",
        }
        input_data = request.model_dump(by_alias=True, exclude_none=True)
        instructions = {
            "task": (
                mode_instructions[request.analysis_mode]
                + " Ground every statement in the provided chunks. Manual doubts belong to the student, "
                "not the teacher. Answer doubts with references. Include bilingual vocabulary and phrases "
                "with definitions and examples, keyPoints, self-test questions and quizCards. Return JSON only."
            ),
            "input": input_data,
            "outputSchema": LearningPackV2.model_json_schema(),
        }
        messages = [
            {"role": "system", "content": "You are a precise learning assistant returning valid JSON only."},
            {"role": "user", "content": json.dumps(instructions, ensure_ascii=False, separators=(",", ":"))},
        ]
        last_error: ProviderError | None = None
        if request.visual_blocks:
            providers = vision_endpoints_from_env()
            if not providers:
                raise ProviderUnavailable("Vision provider is not configured")
        else:
            providers = self.endpoints
        for provider in providers:
            previous_content = ""
            repair_error: str | None = None
            provider_messages = messages
            for attempt in range(2):
                if repair_error is not None:
                    provider_messages = [
                        *provider_messages,
                        {"role": "assistant", "content": previous_content},
                        {
                            "role": "user",
                            "content": (
                                "The previous response was invalid. Return the complete corrected JSON object only, "
                                "without markdown. Use the exact outputSchema field names, include both Chinese and "
                                "English definitions, and preserve existing sourceIds. Validation error: " + repair_error
                            ),
                        },
                    ]
                try:
                    if request.visual_blocks:
                        previous_content = await self._request_vision_provider(
                            provider, instructions, request, repair_error
                        )
                    else:
                        previous_content = await self._request_provider(provider, provider_messages)
                    if len(previous_content) > 200000:
                        raise ValueError("provider JSON content exceeds 200000 characters")
                    data = json.loads(previous_content)
                    if not isinstance(data, dict):
                        raise ValueError("provider JSON root must be an object")
                    return LearningPackV2.model_validate(
                        _normalize_learning_pack(data),
                        strict=True,
                        context={
                            "sources": {chunk.source_id for chunk in request.chunks},
                            "doubt_ids": {doubt.doubt_id for doubt in request.manual_doubts},
                            "visual_ids": {block.source_id for block in request.visual_blocks},
                        },
                    )
                except ProviderError as exc:
                    last_error = exc
                    break
                except (json.JSONDecodeError, ValidationError, ValueError) as exc:
                    repair_error = str(exc)[:4000]
                    if attempt == 1:
                        last_error = ProviderInvalidResponse("AI provider returned invalid v2 learning minutes after one repair")
                        last_error.__cause__ = exc
        if last_error is not None:
            raise last_error
        raise ProviderInvalidResponse("AI provider response could not be validated")

    async def _request_vision_provider(
        self,
        provider,
        instructions: dict,
        request: LearningPackRequest,
        repair_error: str | None = None,
    ) -> str:
        content: list[dict] = [{"type": "text", "text": json.dumps(instructions, ensure_ascii=False)}]
        for block in request.visual_blocks:
            content.append({"type": "text", "text": f"sourceId={block.source_id}\nOCR context:\n{block.ocr_text}"})
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:{block.mime_type};base64,{block.image_base64}"},
            })
        if repair_error is not None:
            content.append({
                "type": "text",
                "text": (
                    "Analyze the same images again. The previous response was invalid. Return only one complete "
                    "JSON object matching outputSchema exactly. Validation error: " + repair_error
                ),
            })
        payload = {
            "model": provider.model,
            "messages": [{"role": "user", "content": content}],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        }
        try:
            endpoint = validate_provider_url(provider.base_url)
            async with httpx.AsyncClient(timeout=60, follow_redirects=False, transport=self.vision_transport) as client:
                response = await client.post(endpoint, json=payload, headers={"Authorization": f"Bearer {provider.api_key}"})
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            error = ProviderUnavailable(f"{provider.name} vision connection failed")
            error.__cause__ = exc
            raise error
        if response.status_code != 200:
            raise ProviderUnavailable(f"{provider.name} vision returned HTTP {response.status_code}")
        try:
            result = response.json()["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            error = ProviderUnavailable(f"{provider.name} vision returned an invalid envelope")
            error.__cause__ = exc
            raise error
        if not isinstance(result, str) or not result.strip():
            raise ProviderUnavailable(f"{provider.name} vision returned empty content")
        self.model_used = provider.model
        return result


def vision_settings() -> tuple[str, str, str] | None:
    base = os.getenv("VISION_PROVIDER_BASE_URL")
    model = os.getenv("VISION_PROVIDER_MODEL")
    key = os.getenv("VISION_PROVIDER_API_KEY")
    if all((base, model, key)):
        return base or "", model or "", key or ""
    return None
