from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, model_validator


class StrictV2Model(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class TranslateRequest(StrictV2Model):
    line_id: int = Field(alias="lineId", gt=0)
    source_text: str = Field(alias="sourceText", min_length=1, max_length=5000)
    source_hash: str = Field(alias="sourceHash", pattern=r"^[0-9a-f]{64}$")
    target_lang: Literal["zh-CN", "en-US"] = Field(alias="targetLang")


class TranslateResponse(StrictV2Model):
    line_id: int = Field(alias="lineId")
    translation: str = Field(min_length=1, max_length=10000)
    source_hash: str = Field(alias="sourceHash")
    model: str
    schema_version: str = Field(alias="schemaVersion", default="2.0")


class ManualDoubt(StrictV2Model):
    doubt_id: str = Field(alias="doubtId", min_length=1, max_length=100)
    source_text: str = Field(alias="sourceText", min_length=1, max_length=5000)
    note: str = Field(default="", max_length=3000)


class VisualBlock(StrictV2Model):
    source_id: str = Field(alias="sourceId", min_length=1, max_length=100)
    ocr_text: str = Field(alias="ocrText", default="", max_length=10000)
    image_base64: str = Field(alias="imageBase64", min_length=32, max_length=8_000_000)
    mime_type: Literal["image/jpeg", "image/png"] = Field(alias="mimeType")


class LearningPackRequest(StrictV2Model):
    course_name: str = Field(alias="courseName", min_length=1, max_length=200)
    course_nature: str = Field(alias="courseNature", default="", max_length=200)
    language: str = Field(min_length=1, max_length=50)
    analysis_mode: Literal["SESSION", "MATERIAL", "EXAM"] = Field(alias="analysisMode")
    chunks: list[dict] = Field(min_length=1, max_length=100)
    glossary: list[dict] = Field(default_factory=list, max_length=100)
    manual_doubts: list[ManualDoubt] = Field(alias="manualDoubts", default_factory=list, max_length=50)
    visual_blocks: list[VisualBlock] = Field(alias="visualBlocks", default_factory=list, max_length=8)

    @model_validator(mode="after")
    def validate_input(self):
        from .schemas import Chunk, GlossaryItem

        self.chunks = [Chunk.model_validate(chunk) for chunk in self.chunks]
        self.glossary = [GlossaryItem.model_validate(item) for item in self.glossary]
        sources = [chunk.source_id for chunk in self.chunks]
        if len(sources) != len(set(sources)):
            raise ValueError("sourceId values must be unique")
        if sum(len(chunk.text) for chunk in self.chunks) > 200000:
            raise ValueError("combined chunk text is too long")
        doubt_ids = [doubt.doubt_id for doubt in self.manual_doubts]
        if len(doubt_ids) != len(set(doubt_ids)):
            raise ValueError("doubtId values must be unique")
        visual_sources = [block.source_id for block in self.visual_blocks]
        if len(visual_sources) != len(set(visual_sources)):
            raise ValueError("visual sourceId values must be unique")
        return self


class MinuteSection(StrictV2Model):
    section_key: str = Field(alias="sectionKey", min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=6000)
    order: int = Field(ge=0, le=1000)
    source_ids: list[str] = Field(alias="sourceIds", min_length=1, max_length=20)


class Minutes(StrictV2Model):
    title: str = Field(min_length=1, max_length=300)
    overview: str = Field(min_length=1, max_length=6000)
    sections: list[MinuteSection] = Field(min_length=1, max_length=20)


class DoubtAnswer(StrictV2Model):
    doubt_id: str = Field(alias="doubtId")
    answer: str = Field(min_length=1, max_length=6000)
    source_ids: list[str] = Field(alias="sourceIds", min_length=1, max_length=20)


class VisualNote(StrictV2Model):
    source_id: str = Field(alias="sourceId")
    description: str = Field(min_length=1, max_length=5000)
    source_ids: list[str] = Field(alias="sourceIds", min_length=1, max_length=20)


class LearningPackV2(StrictV2Model):
    minutes: Minutes
    doubt_answers: list[DoubtAnswer] = Field(alias="doubtAnswers", default_factory=list, max_length=50)
    visual_notes: list[VisualNote] = Field(alias="visualNotes", default_factory=list, max_length=20)
    vocabulary: list[dict] = Field(default_factory=list, max_length=30)
    phrases: list[dict] = Field(default_factory=list, max_length=30)
    key_points: list[dict] = Field(alias="keyPoints", default_factory=list, max_length=20)
    questions: list[dict] = Field(default_factory=list, max_length=20)
    quiz_cards: list[dict] = Field(alias="quizCards", default_factory=list, max_length=30)

    @model_validator(mode="after")
    def validate_references(self, info: ValidationInfo):
        from .schemas import KeyPointItem, PhraseItem, QuestionItem, QuizCard, VocabularyItem

        self.vocabulary = [VocabularyItem.model_validate(item) for item in self.vocabulary]
        self.phrases = [PhraseItem.model_validate(item) for item in self.phrases]
        self.key_points = [KeyPointItem.model_validate(item) for item in self.key_points]
        self.questions = [QuestionItem.model_validate(item) for item in self.questions]
        self.quiz_cards = [QuizCard.model_validate(item) for item in self.quiz_cards]
        context = info.context or {}
        sources = context.get("sources", set())
        doubt_ids = context.get("doubt_ids", set())
        visual_ids = context.get("visual_ids", set())
        for section in self.minutes.sections:
            if sources and not set(section.source_ids).issubset(sources):
                raise ValueError("minutes contains an unknown sourceId")
        for answer in self.doubt_answers:
            if (doubt_ids and answer.doubt_id not in doubt_ids) or (sources and not set(answer.source_ids).issubset(sources)):
                raise ValueError("doubt answer contains an invalid reference")
        for note in self.visual_notes:
            if (visual_ids and note.source_id not in visual_ids) or (sources and not set(note.source_ids).issubset(sources | visual_ids)):
                raise ValueError("visual note contains an invalid reference")
        for item in [*self.vocabulary, *self.phrases, *self.key_points, *self.questions, *self.quiz_cards]:
            if sources and not set(item.source_ids).issubset(sources | visual_ids):
                raise ValueError("learning item contains an unknown sourceId")
        return self


class LearningPackResponse(StrictV2Model):
    analysis_id: str = Field(alias="analysisId")
    input_sha256: str = Field(alias="inputSha256", pattern=r"^[0-9a-f]{64}$")
    prompt_version: str = Field(alias="promptVersion")
    schema_version: str = Field(alias="schemaVersion")
    model: str
    package: LearningPackV2


class LearningPackJobError(StrictV2Model):
    code: Literal[
        "quota_exceeded",
        "provider_unavailable",
        "invalid_response",
        "internal",
    ]
    message: str = Field(min_length=1, max_length=1000)


class LearningPackJobCreateResponse(StrictV2Model):
    job_id: str = Field(alias="jobId")
    status: Literal["queued", "processing", "succeeded", "failed"]


class LearningPackJobResponse(StrictV2Model):
    job_id: str = Field(alias="jobId")
    status: Literal["queued", "processing", "succeeded", "failed"]
    result: LearningPackResponse | None = None
    error: LearningPackJobError | None = None

    @model_validator(mode="after")
    def validate_outcome(self):
        if self.status == "succeeded" and self.result is None:
            raise ValueError("succeeded jobs require a result")
        if self.status == "failed" and self.error is None:
            raise ValueError("failed jobs require an error")
        if self.status in {"queued", "processing"} and (
            self.result is not None or self.error is not None
        ):
            raise ValueError("pending jobs cannot have a result or error")
        return self

