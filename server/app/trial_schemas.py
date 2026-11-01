from __future__ import annotations

from pydantic import Field, field_validator

from .schemas import StrictModel


class TrialCodeRequest(StrictModel):
    phone: str = Field(min_length=3, max_length=32)


class TrialCodeResponse(StrictModel):
    sent: bool
    expires_in_seconds: int = Field(alias="expiresInSeconds")
    resend_after_seconds: int = Field(alias="resendAfterSeconds")
    phone_masked: str = Field(alias="phoneMasked")


class TrialApplyRequest(StrictModel):
    phone: str = Field(min_length=3, max_length=32)
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    name: str = Field(min_length=1, max_length=30)
    nickname: str = Field(min_length=1, max_length=30)
    consent: bool

    @field_validator("name", "nickname")
    @classmethod
    def clean_display_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("姓名和昵称不能为空")
        if any(ord(char) < 32 for char in cleaned):
            raise ValueError("姓名和昵称不能包含控制字符")
        return cleaned


class TrialLimitsResponse(StrictModel):
    ai_packs_per_day: int = Field(alias="aiPacksPerDay")
    audio_minutes_per_day: int = Field(alias="audioMinutesPerDay")
    text_characters_per_day: int = Field(alias="textCharactersPerDay")
    documents_per_day: int = Field(alias="documentsPerDay")
    max_devices: int = Field(alias="maxDevices")


class TrialApplicationResponse(StrictModel):
    applied: bool
    phone_masked: str = Field(alias="phoneMasked")
    valid_until: str = Field(alias="validUntil")
    limits: TrialLimitsResponse
    message: str = ""
    # 调用方带了有效设备令牌时，开卡后直接绑定该设备；浏览器自助申请因此只需一次短信。
    device_bound: bool = Field(default=False, alias="deviceBound")


class TrialStatusResponse(StrictModel):
    sms_configured: bool = Field(alias="smsConfigured")
    defaults: TrialLimitsResponse
