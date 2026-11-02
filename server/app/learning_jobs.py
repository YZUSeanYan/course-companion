from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone

from .accounts import resolve_quota_subject
from .config import Settings
from .db import (
    AccountDisabled,
    AccountExpired,
    AccountRequired,
    Database,
    QuotaExceeded,
)
from .provider import (
    ProviderConfigurationError,
    ProviderInvalidResponse,
    ProviderUnavailable,
)
from .v2_provider import PROMPT_VERSION_V2, SCHEMA_VERSION_V2, V2Provider
from .v2_schemas import LearningPackRequest, LearningPackResponse

SUCCEEDED_DEDUPE_WINDOW = timedelta(minutes=15)
LEARNING_PACK_JOB_TIMEOUT_SECONDS = 300.0

logger = logging.getLogger(__name__)

QUOTA_EXCEEDED_MESSAGE = "今日学习包额度已用完，请明天再试。"
PROVIDER_UNAVAILABLE_MESSAGE = "AI 服务暂时不可用，请稍后重试。"
PROVIDER_TIMEOUT_MESSAGE = "AI 服务响应超时，请稍后重新发起。"
INVALID_RESPONSE_MESSAGE = "AI 返回内容无效，请重新发起。"
INTERNAL_ERROR_MESSAGE = "生成学习包时发生内部错误，请稍后重试。"
INTERRUPTED_ERROR_MESSAGE = "服务重启导致任务中断，请重新发起。"


def canonical_learning_pack_sha256(payload: LearningPackRequest) -> str:
    canonical = json.dumps(
        payload.model_dump(by_alias=True, exclude_none=True),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def recent_success_cutoff() -> str:
    return (datetime.now(timezone.utc) - SUCCEEDED_DEDUPE_WINDOW).isoformat()


def error_for_exception(exc: Exception) -> tuple[str, str]:
    if isinstance(exc, AccountRequired):
        return "account_required", str(exc)
    if isinstance(exc, AccountDisabled):
        return "account_disabled", str(exc)
    if isinstance(exc, AccountExpired):
        return "account_expired", str(exc)
    if isinstance(exc, QuotaExceeded):
        return "quota_exceeded", QUOTA_EXCEEDED_MESSAGE
    if isinstance(exc, (ProviderConfigurationError, ProviderUnavailable, TimeoutError)):
        return "provider_unavailable", PROVIDER_UNAVAILABLE_MESSAGE
    if isinstance(exc, ProviderInvalidResponse):
        return "invalid_response", INVALID_RESPONSE_MESSAGE
    return "internal", INTERNAL_ERROR_MESSAGE


def job_response_payload(job: dict) -> dict:
    payload = {"jobId": job["id"], "status": job["status"]}
    if job["status"] == "succeeded" and job["result_json"]:
        payload["result"] = json.loads(job["result_json"])
    if job["status"] == "failed":
        payload["error"] = {
            "code": job["error_code"],
            "message": job["error_message"],
        }
    return payload


class LearningPackJobManager:
    def __init__(self, database: Database, settings: Settings) -> None:
        self.database = database
        self.settings = settings
        self._tasks: set[asyncio.Task] = set()
        self._fail_interrupted_jobs()

    def _fail_interrupted_jobs(self) -> None:
        interrupted = self.database.fail_interrupted_learning_pack_jobs(
            "internal", INTERRUPTED_ERROR_MESSAGE
        )
        for job in interrupted:
            if job["analysis_id"]:
                try:
                    self.database.release_analysis(job["device_id"], job.get("account_id"))
                except Exception:
                    pass

    def schedule(
        self,
        job_id: str,
        device_id: str,
        input_sha256: str,
        request: LearningPackRequest,
        provider: V2Provider,
    ) -> None:
        task = asyncio.create_task(
            self._run(job_id, device_id, input_sha256, request, provider)
        )
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _run(
        self,
        job_id: str,
        device_id: str,
        input_sha256: str,
        request: LearningPackRequest,
        provider: V2Provider,
    ) -> None:
        analysis_id: str | None = None
        account_id: str | None = None
        quota_reserved = False
        try:
            self.database.mark_learning_pack_job_processing(device_id, job_id)
            subject = resolve_quota_subject(self.database, self.settings, device_id)
            account_id = subject.account_id
            analysis_id = self.database.reserve_analysis(
                device_id, subject.limits.ai_packs, account_id
            )
            quota_reserved = True
            self.database.set_learning_pack_job_analysis(
                device_id, job_id, analysis_id
            )
            package = await asyncio.wait_for(
                provider.generate_learning_pack(request),
                timeout=LEARNING_PACK_JOB_TIMEOUT_SECONDS,
            )
            model = provider.model_used
            result = LearningPackResponse(
                analysisId=analysis_id,
                inputSha256=input_sha256,
                promptVersion=PROMPT_VERSION_V2,
                schemaVersion=SCHEMA_VERSION_V2,
                model=model,
                package=package,
            )
            result_json = result.model_dump_json(by_alias=True)
            self.database.record_analysis(
                analysis_id=analysis_id,
                device_id=device_id,
                input_sha256=input_sha256,
                prompt_version=PROMPT_VERSION_V2,
                schema_version=SCHEMA_VERSION_V2,
                model=model,
            )
            quota_reserved = False
            self.database.complete_learning_pack_job(
                device_id, job_id, result_json, model, analysis_id
            )
        except asyncio.CancelledError:
            if quota_reserved:
                self._release_quota(device_id, account_id)
            self._fail_job(
                device_id, job_id, "internal", INTERNAL_ERROR_MESSAGE, provider
            )
            raise
        except TimeoutError:
            if quota_reserved:
                self._release_quota(device_id, account_id)
            logger.warning("learning pack job %s timed out after %.0fs", job_id, LEARNING_PACK_JOB_TIMEOUT_SECONDS)
            self._fail_job(
                device_id, job_id, "provider_unavailable", PROVIDER_TIMEOUT_MESSAGE, provider
            )
        except Exception as exc:
            if quota_reserved:
                self._release_quota(device_id, account_id)
            code, message = error_for_exception(exc)
            logger.warning(
                "learning pack job %s failed code=%s error=%s: %s",
                job_id,
                code,
                type(exc).__name__,
                exc,
            )
            self._fail_job(device_id, job_id, code, message, provider)

    def _release_quota(self, device_id: str, account_id: str | None) -> None:
        try:
            self.database.release_analysis(device_id, account_id)
        except Exception:
            pass

    def _fail_job(
        self,
        device_id: str,
        job_id: str,
        code: str,
        message: str,
        provider: V2Provider,
    ) -> None:
        try:
            self.database.fail_learning_pack_job(
                device_id,
                job_id,
                code,
                message,
                getattr(provider, "model_used", None),
            )
        except Exception:
            pass
