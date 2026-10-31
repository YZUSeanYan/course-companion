from __future__ import annotations

from pydantic import Field

from .schemas import StrictModel


class AccountActivateRequest(StrictModel):
    phone: str = Field(min_length=3, max_length=32)


class AccountLimitsResponse(StrictModel):
    ai_packs_per_day: int = Field(alias="aiPacksPerDay")
    audio_minutes_per_day: int = Field(alias="audioMinutesPerDay")
    text_characters_per_day: int = Field(alias="textCharactersPerDay")
    documents_per_day: int = Field(alias="documentsPerDay")
    max_devices: int = Field(alias="maxDevices")


class AccountUsageResponse(StrictModel):
    date: str
    ai_packs: int = Field(alias="aiPacks")
    audio_minutes: float = Field(alias="audioMinutes")
    text_characters: int = Field(alias="textCharacters")
    documents: int


class AccountStatusResponse(StrictModel):
    activated: bool
    required: bool
    status: str
    phone_masked: str = Field(alias="phoneMasked", default="")
    display_name: str = Field(alias="displayName", default="")
    valid_until: str | None = Field(alias="validUntil", default=None)
    limits: AccountLimitsResponse
    usage: AccountUsageResponse
