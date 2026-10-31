from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, model_validator


OutputName = Literal[
    "summary", "vocabulary", "phrases", "keyPoints", "questions", "quizCards"
]
OUTPUT_NAMES = (
    "summary",
    "vocabulary",
    "phrases",
    "keyPoints",
    "questions",
    "quizCards",
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class GlossaryItem(StrictModel):
    term: str = Field(min_length=1, max_length=120)
    definition: str | None = Field(default=None, max_length=1000)


class Chunk(StrictModel):
    source_id: str = Field(alias="sourceId", min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=20000)
    page: int | None = Field(default=None, ge=1, le=100000)
    start_ms: int | None = Field(default=None, alias="startMs", ge=0)
    end_ms: int | None = Field(default=None, alias="endMs", ge=0)

    @model_validator(mode="after")
    def validate_time_range(self) -> "Chunk":
        if (self.start_ms is None) != (self.end_ms is None):
            raise ValueError("startMs and endMs must be provided together")
        if (
            self.start_ms is not None
            and self.end_ms is not None
            and self.end_ms <= self.start_ms
        ):
            raise ValueError("endMs must be greater than startMs")
        return self


class AnalyzeRequest(StrictModel):
    course_name: str = Field(alias="courseName", min_length=1, max_length=200)
    language: str = Field(min_length=1, max_length=50)
    glossary: list[GlossaryItem] = Field(default_factory=list, max_length=100)
    chunks: list[Chunk] = Field(min_length=1, max_length=100)
    requested_outputs: list[OutputName] = Field(
        alias="requestedOutputs", min_length=1, max_length=6
    )

    @model_validator(mode="after")
    def validate_request(self) -> "AnalyzeRequest":
        source_ids = [chunk.source_id for chunk in self.chunks]
        if len(source_ids) != len(set(source_ids)):
            raise ValueError("sourceId values must be unique")
        if len(self.requested_outputs) != len(set(self.requested_outputs)):
            raise ValueError("requestedOutputs values must be unique")
        if sum(len(chunk.text) for chunk in self.chunks) > 200000:
            raise ValueError("combined chunk text must not exceed 200000 characters")
        return self


class SourceLinked(StrictModel):
    source_ids: list[str] = Field(
        alias="sourceIds", min_length=1, max_length=20
    )

    @model_validator(mode="after")
    def unique_sources(self) -> "SourceLinked":
        if len(self.source_ids) != len(set(self.source_ids)):
            raise ValueError("sourceIds values must be unique")
        return self


class SummaryItem(SourceLinked):
    text: str = Field(min_length=1, max_length=2000)


class VocabularyItem(SourceLinked):
    term: str = Field(min_length=1, max_length=120)
    definition_zh: str = Field(alias="definitionZh", min_length=1, max_length=1000)
    definition_en: str = Field(alias="definitionEn", min_length=1, max_length=1000)
    example: str = Field(min_length=1, max_length=1500)


class PhraseItem(SourceLinked):
    phrase: str = Field(min_length=1, max_length=200)
    definition_zh: str = Field(alias="definitionZh", min_length=1, max_length=1000)
    definition_en: str = Field(alias="definitionEn", min_length=1, max_length=1000)
    example: str = Field(min_length=1, max_length=1500)


class KeyPointItem(SourceLinked):
    text: str = Field(min_length=1, max_length=2000)


class QuestionItem(SourceLinked):
    question: str = Field(min_length=1, max_length=1000)
    answer: str = Field(min_length=1, max_length=2000)


class QuizCard(SourceLinked):
    front: str = Field(min_length=1, max_length=1000)
    back: str = Field(min_length=1, max_length=2000)


class LearningPackage(StrictModel):
    summary: list[SummaryItem] = Field(default_factory=list, max_length=8)
    vocabulary: list[VocabularyItem] = Field(default_factory=list, max_length=30)
    phrases: list[PhraseItem] = Field(default_factory=list, max_length=30)
    key_points: list[KeyPointItem] = Field(
        default_factory=list, alias="keyPoints", max_length=20
    )
    questions: list[QuestionItem] = Field(default_factory=list, max_length=20)
    quiz_cards: list[QuizCard] = Field(
        default_factory=list, alias="quizCards", max_length=30
    )

    @model_validator(mode="after")
    def validate_sources_and_outputs(
        self, info: ValidationInfo
    ) -> "LearningPackage":
        context = info.context or {}
        valid_sources = context.get("source_ids")
        requested_values = context.get("requested_outputs")
        requested = set(requested_values) if requested_values is not None else None
        fields = {
            "summary": self.summary,
            "vocabulary": self.vocabulary,
            "phrases": self.phrases,
            "keyPoints": self.key_points,
            "questions": self.questions,
            "quizCards": self.quiz_cards,
        }
        for output_name, items in fields.items():
            if requested is not None:
                if output_name in requested and not items:
                    raise ValueError(f"requested output {output_name} must not be empty")
                if output_name not in requested and items:
                    raise ValueError(f"unrequested output {output_name} must be empty")
            if valid_sources is not None:
                for item in items:
                    unknown = set(item.source_ids) - valid_sources
                    if unknown:
                        raise ValueError(
                            f"{output_name} contains sourceIds absent from input"
                        )
        return self


class DeviceRegistrationResponse(StrictModel):
    device_id: str = Field(alias="deviceId")
    token: str
    token_type: str = Field(alias="tokenType", default="bearer")


class AnalysisResponse(StrictModel):
    analysis_id: str = Field(alias="analysisId")
    input_sha256: str = Field(alias="inputSha256", pattern=r"^[0-9a-f]{64}$")
    prompt_version: str = Field(alias="promptVersion")
    schema_version: str = Field(alias="schemaVersion")
    model: str
    package: LearningPackage


class HealthResponse(StrictModel):
    status: Literal["ok"]
    provider_configured: bool = Field(alias="providerConfigured")
