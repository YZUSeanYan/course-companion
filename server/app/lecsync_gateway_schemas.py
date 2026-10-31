from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LecsyncModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class TermPair(LecsyncModel):
    source: str = Field(min_length=1, max_length=120)
    target: str = Field(min_length=1, max_length=120)


class TranslationOptions(LecsyncModel):
    sourceText: str = Field(alias="text", min_length=1, max_length=2000)
    sourceLang: str = Field(default="auto", min_length=1, max_length=32)
    targetLang: str = Field(min_length=1, max_length=32)
    context: str = Field(default="", max_length=2000)
    terms: list[TermPair] = Field(default_factory=list, max_length=20)
    model: str | None = Field(default=None, max_length=120)
    lineId: int | None = Field(default=None, gt=0)
    sourceHash: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")


class AudioOptions(LecsyncModel):
    model: str | None = Field(default=None, max_length=120)
    language: str = Field(default="auto", min_length=1, max_length=32)
    timestamps: Literal["none", "segment", "word"] = "none"
    diarization: bool = False
    webhookId: str | None = Field(default=None, max_length=256)
    hotwords: list[str] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def validate_hotwords(self):
        if any(not word.strip() or len(word) > 120 for word in self.hotwords):
            raise ValueError("Each hotword must contain 1-120 characters")
        return self


class AudioUrlJobRequest(LecsyncModel):
    fileUrl: str = Field(min_length=8, max_length=2048)
    options: AudioOptions = Field(default_factory=AudioOptions)


class VoiceTypingTerm(LecsyncModel):
    term: str = Field(min_length=1, max_length=120)
    value: str = Field(min_length=1, max_length=500)


class VoiceTypingOptions(LecsyncModel):
    language: str | None = Field(default=None, max_length=32)
    polish: bool = True
    translateTo: str | None = Field(default=None, max_length=32)
    app: str | None = Field(default=None, max_length=64)
    terms: list[str | VoiceTypingTerm] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def validate_terms(self):
        if any(isinstance(term, str) and not (1 <= len(term) <= 120) for term in self.terms):
            raise ValueError("Invalid voice typing term")
        if self.translateTo and not self.polish:
            raise ValueError("translateTo requires polishing")
        if any(not isinstance(term, str) for term in self.terms) and not self.polish:
            raise ValueError("Replacements require polishing")
        return self


class RealtimeTranscribe(LecsyncModel):
    languages: list[str] = Field(min_length=1, max_length=60)
    strict: bool | None = None
    identifyLanguage: bool | None = None
    displayMode: Literal["classic", "sentence"] | None = None
    segmentation: Literal["short", "balanced", "complete"] | None = None
    speakers: bool | None = None


class RealtimeTranslate(LecsyncModel):
    languages: list[str] = Field(min_length=2, max_length=2)


class RealtimeGlossary(LecsyncModel):
    terms: list[str] | None = Field(default=None, max_length=50)
    pairs: list[TermPair] | None = Field(default=None, max_length=50)
    context: str | None = Field(default=None, max_length=2000)


class RealtimeConfig(LecsyncModel):
    transcribe: RealtimeTranscribe
    translate: RealtimeTranslate | None = None
    glossary: RealtimeGlossary | None = None
    aiEnhance: bool = False
    digest: bool = False
    store: bool = False
    webhookId: str | None = Field(default=None, max_length=256)
    region: Literal["us", "uk", "jp", "ru"] | None = None

    @model_validator(mode="after")
    def validate_options(self):
        if self.aiEnhance and self.translate is None:
            raise ValueError("AI enhancement requires translation")
        return self


def snake_fields(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return snake_fields(value.model_dump(by_alias=True, exclude_none=True))
    if isinstance(value, list):
        return [snake_fields(item) for item in value]
    if isinstance(value, dict):
        return {camel_to_snake(key): snake_fields(item) for key, item in value.items()}
    return value


def camel_fields(value: Any) -> Any:
    if isinstance(value, list):
        return [camel_fields(item) for item in value]
    if isinstance(value, dict):
        return {snake_to_camel(str(key)): camel_fields(item) for key, item in value.items()}
    return value


def camel_to_snake(value: str) -> str:
    return "".join("_" + char.lower() if char.isupper() else char for char in value)


def snake_to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part[:1].upper() + part[1:] for part in rest)
