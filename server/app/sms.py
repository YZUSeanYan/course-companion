from __future__ import annotations

import base64
import hashlib
import hmac
import json
import uuid
from datetime import datetime, timezone
from urllib.parse import quote, urlsplit

import httpx

from .config import Settings

SMS_ENDPOINT = "https://dypnsapi.aliyuncs.com/"
SMS_HOST = "dypnsapi.aliyuncs.com"


class SmsDeliveryError(RuntimeError):
    def __init__(self, provider_code: str) -> None:
        super().__init__(f"SMS delivery failed: {provider_code}")
        self.provider_code = provider_code


def _percent_encode(value: str) -> str:
    return quote(value, safe="~")


def _validate_endpoint() -> None:
    """Reject a tampered fixed endpoint before sending credentials."""
    try:
        parsed = urlsplit(SMS_ENDPOINT)
    except ValueError as exc:
        raise SmsDeliveryError("ENDPOINT_INVALID") from exc
    if (
        parsed.scheme != "https"
        or parsed.hostname != SMS_HOST
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise SmsDeliveryError("ENDPOINT_INVALID")


class AliyunSmsSender:
    """Aliyun PNVS (号码认证服务) SMS verification RPC client.

    The endpoint is fixed and never comes from request input. Phone numbers and
    verification codes are sent only to Aliyun and are never logged here.
    """

    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None) -> None:
        if not settings.sms_configured:
            raise ValueError("Aliyun SMS is not configured")
        self.access_key_id = settings.aliyun_sms_access_key_id or ""
        self.access_key_secret = settings.aliyun_sms_access_key_secret or ""
        self.sign_name = settings.aliyun_sms_sign_name or ""
        self.template_code = settings.aliyun_sms_template_code or ""
        self.region = settings.aliyun_sms_region
        self.code_ttl_seconds = settings.trial_code_ttl_seconds
        self.resend_seconds = settings.trial_code_resend_seconds
        self.transport = transport

    def _signed_params(self, phone: str, code: str) -> dict[str, str]:
        minutes = max(1, (self.code_ttl_seconds + 59) // 60)
        params = {
            "AccessKeyId": self.access_key_id,
            "Action": "SendSmsVerifyCode",
            "CodeLength": str(len(code)),
            "Format": "JSON",
            "Interval": str(self.resend_seconds),
            "PhoneNumber": phone,
            "RegionId": self.region,
            "SignName": self.sign_name,
            "SignatureMethod": "HMAC-SHA1",
            "SignatureNonce": uuid.uuid4().hex,
            "SignatureVersion": "1.0",
            "TemplateCode": self.template_code,
            "TemplateParam": json.dumps(
                {"code": code, "min": str(minutes)}, separators=(",", ":")
            ),
            "Timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "ValidTime": str(self.code_ttl_seconds),
            "Version": "2017-05-25",
        }
        canonical = "&".join(
            f"{_percent_encode(key)}={_percent_encode(str(params[key]))}"
            for key in sorted(params)
        )
        string_to_sign = f"POST&%2F&{_percent_encode(canonical)}"
        digest = hmac.new(
            (self.access_key_secret + "&").encode("utf-8"),
            string_to_sign.encode("utf-8"),
            hashlib.sha1,
        ).digest()
        params["Signature"] = base64.b64encode(digest).decode("ascii")
        return params

    async def send_code(self, phone: str, code: str) -> None:
        _validate_endpoint()
        if not code.isdigit() or not 4 <= len(code) <= 8:
            raise SmsDeliveryError("INVALID_CODE")
        params = self._signed_params(phone, code)
        async with httpx.AsyncClient(
            timeout=15.0, follow_redirects=False, transport=self.transport
        ) as client:
            response = await client.post(SMS_ENDPOINT, data=params)
        if response.status_code != 200:
            raise SmsDeliveryError(f"HTTP_{response.status_code}")
        try:
            payload = response.json()
        except ValueError as exc:
            raise SmsDeliveryError("INVALID_JSON") from exc
        provider_code = str(payload.get("Code") or "UNKNOWN")
        if provider_code != "OK" or payload.get("Success") is False:
            raise SmsDeliveryError(provider_code)
