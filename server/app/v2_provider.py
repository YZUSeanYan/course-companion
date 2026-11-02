from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import os
import time

import httpx
from PIL import Image
from pydantic import ValidationError

from .provider import (
    AIProvider,
    ProviderError,
    ProviderInvalidResponse,
    ProviderUnavailable,
    validate_provider_url,
)
from .provider_catalog import vision_endpoints_from_env
from .v2_schemas import LearningPackRequest, LearningPackV2, TranslateRequest

PROMPT_VERSION_V2 = "learning-minutes-v4"
SCHEMA_VERSION_V2 = "2.0"

logger = logging.getLogger(__name__)

# Per-category budgets enforced after generation regardless of prompt compliance.
ITEM_BUDGETS = {
    "vocabulary": 12,
    "phrases": 6,
    "keyPoints": 12,
    "questions": 8,
    "quizCards": 10,
}

MINUTE_SECTION_BUDGET = 6

# Hard ceilings applied after generation. They are deliberately generous
# enough to keep a complete thought, but stop providers from writing essays.
TEXT_CAPS = {
    "minutes.title": 80,
    "minutes.overview": 260,
    "section.title": 40,
    "section.body": 260,
    "doubt.answer": 300,
    "visual.description": 200,
    "vocabulary.definitionZh": 80,
    "vocabulary.definitionEn": 200,
    "vocabulary.example": 200,
    "phrases.definitionZh": 80,
    "phrases.definitionEn": 200,
    "phrases.example": 160,
    "keyPoints.text": 120,
    "questions.question": 100,
    "questions.answer": 160,
    "quizCards.front": 80,
    "quizCards.back": 160,
}


def _compact_text(value: object, limit: int) -> str:
    """Collapse whitespace and cut at a sentence boundary near the limit."""
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    window = text[:limit]
    floor = max(1, int(limit * 0.55))
    for index in range(len(window) - 1, floor - 1, -1):
        if window[index] in "。！？；.!?;":
            return window[: index + 1]
    return window.rstrip("，,、；;:： ") + "…"


def _compact_learning_pack(pack: dict) -> dict:
    """Enforce concise prose after provider aliasing, before dedupe/cap."""
    minutes = pack.get("minutes")
    if isinstance(minutes, dict):
        minutes = dict(minutes)
        minutes["title"] = _compact_text(minutes.get("title"), TEXT_CAPS["minutes.title"])
        minutes["overview"] = _compact_text(
            minutes.get("overview"), TEXT_CAPS["minutes.overview"]
        )
        sections = []
        for section in minutes.get("sections", [])[:MINUTE_SECTION_BUDGET]:
            if not isinstance(section, dict):
                continue
            item = dict(section)
            item["title"] = _compact_text(item.get("title"), TEXT_CAPS["section.title"])
            item["body"] = _compact_text(item.get("body"), TEXT_CAPS["section.body"])
            sections.append(item)
        minutes["sections"] = sections
        pack["minutes"] = minutes

    for item in pack.get("doubtAnswers", []):
        if isinstance(item, dict):
            item["answer"] = _compact_text(item.get("answer"), TEXT_CAPS["doubt.answer"])
    for item in pack.get("visualNotes", []):
        if isinstance(item, dict):
            item["description"] = _compact_text(
                item.get("description"), TEXT_CAPS["visual.description"]
            )
    for item in pack.get("vocabulary", []):
        if isinstance(item, dict):
            item["definitionZh"] = _compact_text(
                item.get("definitionZh"), TEXT_CAPS["vocabulary.definitionZh"]
            )
            item["definitionEn"] = _compact_text(
                item.get("definitionEn"), TEXT_CAPS["vocabulary.definitionEn"]
            )
            item["example"] = _compact_text(
                item.get("example"), TEXT_CAPS["vocabulary.example"]
            )
    for item in pack.get("phrases", []):
        if isinstance(item, dict):
            item["definitionZh"] = _compact_text(
                item.get("definitionZh"), TEXT_CAPS["phrases.definitionZh"]
            )
            item["definitionEn"] = _compact_text(
                item.get("definitionEn"), TEXT_CAPS["phrases.definitionEn"]
            )
            item["example"] = _compact_text(
                item.get("example"), TEXT_CAPS["phrases.example"]
            )
    for item in pack.get("keyPoints", []):
        if isinstance(item, dict):
            item["text"] = _compact_text(item.get("text"), TEXT_CAPS["keyPoints.text"])
    for item in pack.get("questions", []):
        if isinstance(item, dict):
            item["question"] = _compact_text(
                item.get("question"), TEXT_CAPS["questions.question"]
            )
            item["answer"] = _compact_text(
                item.get("answer"), TEXT_CAPS["questions.answer"]
            )
    for item in pack.get("quizCards", []):
        if isinstance(item, dict):
            item["front"] = _compact_text(item.get("front"), TEXT_CAPS["quizCards.front"])
            item["back"] = _compact_text(item.get("back"), TEXT_CAPS["quizCards.back"])
    return pack


def _compact_image_base64(encoded: str, mime_type: str) -> tuple[str, str]:
    """Downscale oversized page images before sending them to a vision model."""
    try:
        raw = base64.b64decode(encoded, validate=False)
        if len(raw) <= 350_000 and mime_type in {"image/jpeg", "image/png"}:
            return encoded, mime_type
        image = Image.open(io.BytesIO(raw))
        image = image.convert("RGB")
        image.thumbnail((1280, 1280))
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=82, optimize=True)
        compacted = base64.b64encode(buffer.getvalue()).decode()
        if len(compacted) < len(encoded):
            return compacted, "image/jpeg"
    except Exception:
        # Invalid/fake image payloads still go to the provider unchanged; the
        # provider will reject them explicitly and failover can continue.
        pass
    return encoded, mime_type


def _dedupe_key(value: str) -> str:
    """Normalize an item title for duplicate detection (case/space/punctuation safe)."""
    import unicodedata

    text = unicodedata.normalize("NFKC", str(value)).lower()
    return "".join(char for char in text if char.isalnum())


def _dedupe_and_cap(pack: dict) -> dict:
    """Drop duplicated or near-duplicated items and enforce per-category budgets.

    Runs after alias normalization, so providers that ignore the prompt still
    yield a compact, non-repetitive learning pack. Phrases duplicating a
    vocabulary term are dropped across categories.
    """
    title_fields = {
        "vocabulary": "term",
        "phrases": "phrase",
        "keyPoints": "text",
        "questions": "question",
        "quizCards": "front",
    }
    vocabulary_keys: set[str] = set()
    for name, field in title_fields.items():
        items = pack.get(name)
        if not isinstance(items, list):
            continue
        seen: set[str] = set()
        kept: list[dict] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            key = _dedupe_key(str(item.get(field, "")))
            if not key:
                continue
            if key in seen:
                continue
            if name == "phrases" and key in vocabulary_keys:
                continue
            seen.add(key)
            if name == "vocabulary":
                vocabulary_keys.add(key)
            kept.append(item)
            if len(kept) >= ITEM_BUDGETS[name]:
                break
        pack[name] = kept
    return pack



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


def _with_sources(item: dict, default_source_ids: list[str]) -> dict:
    """Fill a missing citation with the request's own sources.

    Providers sometimes omit sourceIds on an otherwise good item. Dropping the
    whole pack for that is worse than citing the page the request came from.
    """
    sources = _source_ids(item)
    if not sources:
        sources = default_source_ids[:3]
    item["sourceIds"] = sources
    return item


def _normalize_learning_pack(
    data: dict,
    default_source_ids: list[str] | None = None,
    fallback_text: str = "",
) -> dict:
    """Adapt provider aliases and drop unusable items instead of failing the pack."""
    default_ids = list(dict.fromkeys(default_source_ids or []))
    pack = dict(data)

    vocabulary = []
    for item in pack.get("vocabulary", []):
        if not isinstance(item, dict):
            continue
        term = _alias(item, "term", "en", "word", "expression")
        definition_zh = _alias(
            item, "definitionZh", "translation", "zh", "chinese", "definition", "meaning"
        )
        definition_en = _english_definition(item, "definition", "meaning", "definitionZh")
        if not term or not (definition_zh or definition_en):
            continue
        vocabulary.append(_with_sources({
            "term": term,
            "definitionZh": definition_zh or definition_en,
            "definitionEn": definition_en or definition_zh,
            "example": _alias(item, "example", "exampleSentence", "sentence"),
            "sourceIds": [],
        }, default_ids))
    pack["vocabulary"] = vocabulary

    phrases = []
    for item in pack.get("phrases", []):
        if not isinstance(item, dict):
            continue
        phrase = _alias(item, "phrase", "expression", "text")
        definition_zh = _alias(
            item, "definitionZh", "translation", "zh", "definition", "meaning"
        )
        definition_en = _english_definition(item, "usage", "definition", "meaning", "definitionZh")
        if not phrase or not (definition_zh or definition_en):
            continue
        phrases.append(_with_sources({
            "phrase": phrase,
            "definitionZh": definition_zh or definition_en,
            "definitionEn": definition_en or definition_zh,
            "example": _alias(item, "example", "exampleSentence", "sentence"),
            "sourceIds": [],
        }, default_ids))
    pack["phrases"] = phrases

    key_points = []
    for item in pack.get("keyPoints", []):
        if not isinstance(item, dict):
            continue
        text = _alias(item, "text", "pointEn", "pointZh", "point", "contentEn", "contentZh", "content")
        if not text:
            continue
        key_points.append(_with_sources({"text": text, "sourceIds": []}, default_ids))
    pack["keyPoints"] = key_points

    questions = []
    for item in pack.get("questions", []):
        if not isinstance(item, dict):
            continue
        question = _alias(item, "questionEn", "questionZh", "question", "front", "prompt")
        answer = _alias(item, "answerEn", "answerZh", "answer", "back", "explanation")
        if not question or not answer:
            continue
        questions.append(_with_sources({
            "question": question,
            "answer": answer,
            "sourceIds": [],
        }, default_ids))
    pack["questions"] = questions

    quiz_cards = []
    for item in pack.get("quizCards", []):
        if not isinstance(item, dict):
            continue
        front = _alias(item, "front", "frontEn", "frontZh", "questionEn", "questionZh", "question", "prompt")
        back = _alias(item, "back", "backEn", "backZh", "answerEn", "answerZh", "answer", "explanation")
        if not front or not back:
            continue
        quiz_cards.append(_with_sources({"front": front, "back": back, "sourceIds": []}, default_ids))
    pack["quizCards"] = quiz_cards

    doubt_answers = []
    for item in pack.get("doubtAnswers", []):
        if not isinstance(item, dict):
            continue
        doubt_id = _alias(item, "doubtId", "id")
        answer = _alias(item, "answerEn", "answerZh", "answer", "text", "content")
        if not doubt_id or not answer:
            continue
        doubt_answers.append(_with_sources({
            "doubtId": doubt_id,
            "answer": answer,
            "sourceIds": [],
        }, default_ids))
    pack["doubtAnswers"] = doubt_answers

    visual_notes = []
    for item in pack.get("visualNotes", []):
        if not isinstance(item, dict):
            continue
        source_id = _alias(item, "sourceId", "source_id")
        description = _alias(item, "description", "text", "content")
        if not source_id or not description:
            continue
        sources = _source_ids(item) or [source_id]
        visual_notes.append({
            "sourceId": source_id,
            "description": description,
            "sourceIds": sources,
        })
    pack["visualNotes"] = visual_notes

    raw_minutes = pack.get("minutes")
    minutes = dict(raw_minutes) if isinstance(raw_minutes, dict) else {}
    overview = _alias(minutes, "overview", "summary") or _compact_text(fallback_text, 260)
    title = _alias(minutes, "title", "heading") or "课堂纪要"
    sections = []
    for index, section in enumerate(minutes.get("sections", [])):
        if not isinstance(section, dict):
            continue
        section_title = _alias(section, "title", "heading")
        body = _alias(section, "body", "content", "text")
        if not section_title or not body:
            continue
        sources = _source_ids(section) or default_ids[:1]
        if not sources:
            continue
        sections.append({
            "sectionKey": _alias(section, "sectionKey", "key", default=f"section-{index + 1}"),
            "title": section_title,
            "body": body,
            "order": _alias(section, "order", "index", default=index),
            "sourceIds": sources,
        })
    minutes["title"] = title
    minutes["overview"] = overview or "本节内容已整理。"
    # The learning card should be a single tight summary. Provider sections
    # are still parsed above so they can supply keyPoints, but the public
    # minutes payload intentionally contains only title + overview.
    minutes["sections"] = []
    pack["minutes"] = minutes
    if not pack.get("keyPoints"):
        # Some providers omit keyPoints even when the minutes contain clear
        # conclusions. Derive one concise takeaway per section; if there are
        # no sections, use the overview itself.
        derived = [
            {
                "text": _compact_text(section["body"], TEXT_CAPS["keyPoints.text"]),
                "sourceIds": section["sourceIds"],
            }
            for section in sections[:MINUTE_SECTION_BUDGET]
            if section.get("body") and section.get("sourceIds")
        ]
        if not derived and default_ids:
            derived = [{
                "text": _compact_text(minutes["overview"], TEXT_CAPS["keyPoints.text"]),
                "sourceIds": default_ids[:1],
            }]
        pack["keyPoints"] = derived
    return _dedupe_and_cap(_compact_learning_pack(pack))


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

    def _messages(
        self,
        instructions: dict,
        previous_content: str = "",
        repair_error: str | None = None,
    ) -> list[dict[str, str]]:
        messages = [
            {"role": "system", "content": "You are a precise learning assistant returning valid JSON only."},
            {"role": "user", "content": json.dumps(instructions, ensure_ascii=False, separators=(",", ":"))},
        ]
        if repair_error is not None:
            messages.extend(
                [
                    {"role": "assistant", "content": previous_content},
                    {
                        "role": "user",
                        "content": (
                            "The previous response was invalid. Return the complete corrected JSON object only, "
                            "without markdown. Use the exact outputSchema field names, include both Chinese and "
                            "English definitions, preserve existing sourceIds, and keep the content concise. "
                            "Validation error: " + repair_error
                        ),
                    },
                ]
            )
        return messages

    def _text_fallback_instructions(
        self, instructions: dict, request: LearningPackRequest
    ) -> dict:
        input_data = dict(instructions.get("input", {}))
        input_data["visualBlocks"] = [
            {"sourceId": block.source_id, "ocrText": block.ocr_text[:4000]}
            for block in request.visual_blocks
        ]
        fallback = dict(instructions)
        fallback["input"] = input_data
        fallback["task"] = (
            str(instructions.get("task", ""))
            + " Page images could not be read by any vision model; use only the OCR text and the"
            + " provided chunks. Do not invent visual details; mark uncertain visual details as 无法确认."
        )
        return fallback

    async def _generate_with_provider(
        self,
        provider,
        instructions: dict,
        request: LearningPackRequest,
        *,
        vision: bool,
    ) -> LearningPackV2:
        previous_content = ""
        repair_error: str | None = None
        for attempt in range(2):
            try:
                if vision:
                    content = await self._request_vision_provider(
                        provider, instructions, request, repair_error
                    )
                else:
                    content = await self._request_provider_once(
                        provider,
                        self._messages(instructions, previous_content, repair_error),
                        timeout_seconds=self.pack_timeout,
                    )
                previous_content = content
                if len(content) > 200000:
                    raise ValueError("provider JSON content exceeds 200000 characters")
                data = json.loads(content)
                if not isinstance(data, dict):
                    raise ValueError("provider JSON root must be an object")
                return LearningPackV2.model_validate(
                    _normalize_learning_pack(
                        data,
                        [chunk.source_id for chunk in request.chunks],
                        request.chunks[0].text if request.chunks else "",
                    ),
                    strict=True,
                    context={
                        "sources": {chunk.source_id for chunk in request.chunks},
                        "doubt_ids": {doubt.doubt_id for doubt in request.manual_doubts},
                        "visual_ids": {block.source_id for block in request.visual_blocks},
                    },
                )
            except ProviderError:
                raise
            except (json.JSONDecodeError, ValidationError, ValueError) as exc:
                repair_error = str(exc)[:4000]
                logger.warning(
                    "learning pack provider=%s model=%s attempt=%s invalid response: %s",
                    provider.name,
                    provider.model,
                    attempt + 1,
                    repair_error[:800],
                )
                if attempt == 1:
                    error = ProviderInvalidResponse(
                        "AI provider returned invalid v2 learning minutes after one repair"
                    )
                    error.__cause__ = exc
                    raise error
        raise ProviderInvalidResponse("AI provider response could not be validated")

    async def _generate_from_providers(
        self,
        providers: list,
        instructions: dict,
        request: LearningPackRequest,
        *,
        vision: bool,
        rounds: int,
        parallel: bool,
    ) -> LearningPackV2:
        last_error: ProviderError | None = None
        for round_index in range(max(1, rounds)):
            ordered = self._ordered_endpoints(providers)
            if parallel and len(ordered) > 1:
                # Hedged/parallel race: the fastest valid brand wins. Losers are
                # cancelled immediately so a slow provider cannot hold the request.
                tasks = {
                    asyncio.create_task(
                        self._generate_with_provider(
                            provider, instructions, request, vision=vision
                        )
                    ): provider
                    for provider in ordered
                }
                pending = set(tasks)
                while pending:
                    done, pending = await asyncio.wait(
                        pending, return_when=asyncio.FIRST_COMPLETED
                    )
                    for task in done:
                        provider = tasks[task]
                        try:
                            result = task.result()
                        except ProviderError as exc:
                            last_error = exc
                            logger.warning(
                                "learning pack provider=%s model=%s vision=%s failed: %s",
                                provider.name,
                                provider.model,
                                vision,
                                exc,
                            )
                            continue
                        for other in pending:
                            other.cancel()
                        if pending:
                            await asyncio.gather(*pending, return_exceptions=True)
                        logger.info(
                            "learning pack winner provider=%s model=%s vision=%s parallel=true",
                            provider.name,
                            provider.model,
                            vision,
                        )
                        return result
            else:
                for provider in ordered:
                    try:
                        return await self._generate_with_provider(
                            provider, instructions, request, vision=vision
                        )
                    except ProviderError as exc:
                        last_error = exc
                        logger.warning(
                            "learning pack provider=%s model=%s vision=%s failed: %s",
                            provider.name,
                            provider.model,
                            vision,
                            exc,
                        )
            if round_index < rounds - 1:
                await asyncio.sleep(self.retry_backoff * (2**round_index))
        if last_error is not None:
            raise last_error
        raise ProviderInvalidResponse("AI provider response could not be validated")

    def _build_instructions(self, request: LearningPackRequest) -> dict:
        mode_instructions = {
            "SESSION": "Create meeting-style classroom minutes with topics, explanations and review actions.",
            "MATERIAL": "Create study notes from the document, not fictional meeting decisions or attendees.",
            "EXAM": "Create exam revision notes and contextual vocabulary. Do not invent meeting decisions.",
        }
        output_language = getattr(request, "output_language", "zh")
        if output_language == "source":
            language_rule = (
                "Use the dominant language of the source material for all explanatory prose."
            )
        else:
            language_rule = (
                "All explanatory prose MUST be Simplified Chinese, even when the source is English:"
                " minutes title/overview/section titles/bodies, keyPoints, questions and answers,"
                " quizCard backs, and doubt answers. Keep vocabulary terms and phrases in their"
                " original language; definitionEn stays English; examples may quote the source"
                " sentence, optionally followed by a short Chinese translation."
            )
        input_data = request.model_dump(by_alias=True, exclude_none=True)
        return {
            "task": (
                mode_instructions[request.analysis_mode]
                + " Write compact study notes, never a transcript or an essay. No filler, no meta"
                + " commentary, no repeated restatement of the prompt."
                + " Ground every statement in the provided chunks. Manual doubts belong to the student,"
                + " not the teacher. Answer doubts with references."
                + " First infer the subject type from courseName/courseNature and the chunk content."
                + " For technical or STEM material (engineering, science, math, medicine, etc.), vocabulary"
                + " must be a glossary of professional terms (term + Chinese definition + English definition"
                + " + an example taken from the text); phrases only when the text truly contains fixed"
                + " collocations, at most 5; put the emphasis on keyPoints, questions and quizCards."
                + " Only for language-learning material may vocabulary contain general words and phrases"
                + " contain common expressions."
                + " Hard budget: at most 12 vocabulary, 6 phrases, 12 keyPoints, 8 questions, 10 quizCards."
                + " Minutes must contain ONLY title and overview; sections MUST be an empty array []."
                + " Conciseness limits: minutes title <= 20 Chinese characters; minutes overview <= 120"
                + " Chinese characters and must state the core conclusion (not describe what the lecture"
                + " does); each keyPoint <= 60 Chinese characters; each question answer <= 80 Chinese"
                + " characters; each quizCard back <= 60 Chinese characters; definitionZh <= 30 Chinese"
                + " characters; definitionEn <= 60 words; example <= 80 characters. For outputLanguage=source,"
                + " keep prose roughly half the length of a typical paragraph."
                + " Give facts, numbers, formulas and conclusions; omit greetings, course logistics and"
                + " generic encouragement. Every item must carry distinct information; never repeat or"
                + " paraphrase the same content within one list or across lists (a phrase must not duplicate"
                + " a vocabulary term, a quizCard must not restate a question). Omit a list entirely rather"
                + " than padding it."
                + " " + language_rule
                + " Return JSON only."
            ),
            "input": input_data,
            "outputSchema": LearningPackV2.model_json_schema(),
        }

    async def generate_learning_pack(self, request: LearningPackRequest) -> LearningPackV2:
        instructions = self._build_instructions(request)
        if request.visual_blocks:
            vision_providers = vision_endpoints_from_env()
            if vision_providers:
                try:
                    return await self._generate_from_providers(
                        vision_providers,
                        instructions,
                        request,
                        vision=True,
                        rounds=1,
                        parallel=False,
                    )
                except ProviderError as exc:
                    logger.warning(
                        "vision chain exhausted, falling back to OCR text: %s", exc
                    )
            else:
                logger.warning("no vision provider configured, using OCR text fallback")
            fallback = self._text_fallback_instructions(instructions, request)
            return await self._generate_from_providers(
                self.endpoints,
                fallback,
                request,
                vision=False,
                rounds=self.max_retries + 1,
                parallel=self.parallel,
            )
        return await self._generate_from_providers(
            self.endpoints,
            instructions,
            request,
            vision=False,
            rounds=self.max_retries + 1,
            parallel=self.parallel,
        )

    async def _request_vision_provider(
        self,
        provider,
        instructions: dict,
        request: LearningPackRequest,
        repair_error: str | None = None,
    ) -> str:
        content: list[dict] = [{"type": "text", "text": json.dumps(instructions, ensure_ascii=False)}]
        compacted = await asyncio.gather(
            *[
                asyncio.to_thread(
                    _compact_image_base64, block.image_base64, block.mime_type
                )
                for block in request.visual_blocks
            ]
        )
        for block, (image_base64, mime_type) in zip(request.visual_blocks, compacted):
            content.append({"type": "text", "text": f"sourceId={block.source_id}\nOCR context:\n{block.ocr_text}"})
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:{mime_type};base64,{image_base64}"},
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
        started = time.monotonic()
        try:
            endpoint = validate_provider_url(provider.base_url)
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(45.0, connect=10.0),
                follow_redirects=False,
                transport=self.vision_transport,
            ) as client:
                response = await client.post(endpoint, json=payload, headers={"Authorization": f"Bearer {provider.api_key}"})
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            self._cool_down(provider)
            logger.warning(
                "vision provider=%s model=%s outcome=network_error elapsed=%.2fs",
                provider.name,
                provider.model,
                time.monotonic() - started,
            )
            error = ProviderUnavailable(f"{provider.name} vision connection failed")
            error.__cause__ = exc
            raise error
        if response.status_code != 200:
            retryable = response.status_code == 429 or 500 <= response.status_code <= 599
            self._cool_down(
                provider,
                seconds=None if retryable else 300,
            )
            logger.warning(
                "vision provider=%s model=%s outcome=http_%s elapsed=%.2fs",
                provider.name,
                provider.model,
                response.status_code,
                time.monotonic() - started,
            )
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
