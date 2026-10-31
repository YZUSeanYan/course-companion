from __future__ import annotations

import hashlib
import time
from collections import OrderedDict

from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import Settings
from .db import QuotaExceeded
from .learning_jobs import (
    LearningPackJobManager,
    canonical_learning_pack_sha256,
    job_response_payload,
    recent_success_cutoff,
)
from .lecsync import LecsyncClient
from .provider import ProviderConfigurationError, ProviderInvalidResponse, ProviderUnavailable
from .rate_limit import SlidingWindowRateLimiter
from .security import token_digest
from .v2_provider import PROMPT_VERSION_V2, SCHEMA_VERSION_V2, V2Provider
from .provider_catalog import vision_endpoints_from_env
from .v2_schemas import (
    LearningPackJobCreateResponse,
    LearningPackJobResponse,
    LearningPackRequest,
    LearningPackResponse,
    TranslateRequest,
    TranslateResponse,
)

bearer_v2 = HTTPBearer(auto_error=False)


def register_v2_routes(app: FastAPI, settings: Settings) -> None:
    app.state.v2_provider = V2Provider(settings) if settings.provider_configured else None
    app.state.lecsync = LecsyncClient()
    app.state.learning_jobs = LearningPackJobManager(
        app.state.db, settings.device_daily_quota
    )
    translation_cache: OrderedDict[tuple[str, str, str], tuple[float, str, str]] = OrderedDict()
    translation_limiter = SlidingWindowRateLimiter(settings.lecsync_rate_limit, 60)

    async def device_id(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_v2)) -> str:
        if credentials is None or credentials.scheme.lower() != "bearer" or not settings.token_pepper:
            raise HTTPException(status_code=401, detail="A valid bearer device token is required")
        found = app.state.db.find_device_by_token_hash(token_digest(credentials.credentials, settings.token_pepper))
        if found is None:
            raise HTTPException(status_code=401, detail="Invalid device token")
        return found

    @app.post("/v2/translate", response_model=TranslateResponse)
    async def translate(payload: TranslateRequest, device: str = Depends(device_id)) -> TranslateResponse:
        if not translation_limiter.allow(device):
            raise HTTPException(status_code=429, detail="Translation rate limit exceeded")
        actual_hash = hashlib.sha256(payload.source_text.encode()).hexdigest()
        if payload.source_hash != actual_hash:
            raise HTTPException(status_code=422, detail="sourceHash does not match sourceText")
        key = (device, actual_hash, payload.target_lang)
        cached = translation_cache.get(key)
        if cached and time.monotonic() - cached[0] < 3600:
            translation_cache.move_to_end(key)
            return TranslateResponse(lineId=payload.line_id, translation=cached[1], sourceHash=actual_hash, model=cached[2], schemaVersion=SCHEMA_VERSION_V2)
        try:
            app.state.db.reserve_lecsync_text(device, len(payload.source_text), settings.lecsync_daily_text_quota)
        except QuotaExceeded as exc:
            raise HTTPException(status_code=429, detail="Daily translation quota exceeded") from exc
        try:
            provider: V2Provider | None = app.state.v2_provider
            lecsync: LecsyncClient = app.state.lecsync
            translation: str | None = None
            model: str | None = None
            lecsync_error: ProviderConfigurationError | ProviderUnavailable | ProviderInvalidResponse | None = None
            if lecsync.configured:
                try:
                    result = await lecsync.translate(payload)
                except (ProviderConfigurationError, ProviderUnavailable, ProviderInvalidResponse) as exc:
                    lecsync_error = exc
                else:
                    translation = result.text
                    model = result.model
            if translation is None:
                if provider is None:
                    if isinstance(lecsync_error, ProviderInvalidResponse):
                        raise HTTPException(status_code=502, detail=str(lecsync_error)) from lecsync_error
                    if lecsync_error is not None:
                        raise HTTPException(status_code=503, detail=str(lecsync_error)) from lecsync_error
                    raise HTTPException(status_code=503, detail="AI provider is not configured")
                try:
                    translation = await provider.translate(payload)
                    model = provider.model_used
                except (ProviderConfigurationError, ProviderUnavailable) as exc:
                    raise HTTPException(status_code=503, detail=str(exc)) from exc
                except ProviderInvalidResponse as exc:
                    raise HTTPException(status_code=502, detail=str(exc)) from exc
            if not translation or len(translation) > 10000:
                raise HTTPException(status_code=502, detail="AI translation is empty or too long")
            translation_cache[key] = (time.monotonic(), translation, model)
            translation_cache.move_to_end(key)
            while len(translation_cache) > 500:
                translation_cache.popitem(last=False)
            return TranslateResponse(lineId=payload.line_id, translation=translation, sourceHash=actual_hash, model=model, schemaVersion=SCHEMA_VERSION_V2)
        except Exception:
            app.state.db.release_lecsync_text(device, len(payload.source_text))
            raise

    @app.post("/v2/learning-pack", response_model=LearningPackResponse)
    async def learning_pack(payload: LearningPackRequest, device: str = Depends(device_id)) -> LearningPackResponse:
        provider: V2Provider | None = app.state.v2_provider
        if provider is None:
            raise HTTPException(status_code=503, detail="AI provider is not configured")
        if payload.visual_blocks and not vision_endpoints_from_env():
            raise HTTPException(status_code=503, detail="Vision provider is not configured; OCR alone is not treated as image understanding")
        digest = canonical_learning_pack_sha256(payload)
        try:
            analysis_id = app.state.db.reserve_analysis(device, settings.device_daily_quota)
        except QuotaExceeded as exc:
            raise HTTPException(status_code=429, detail="Daily analysis quota exceeded") from exc
        try:
            package = await provider.generate_learning_pack(payload)
            app.state.db.record_analysis(
                analysis_id=analysis_id,
                device_id=device,
                input_sha256=digest,
                prompt_version=PROMPT_VERSION_V2,
                schema_version=SCHEMA_VERSION_V2,
                model=provider.model_used,
            )
        except (ProviderConfigurationError, ProviderUnavailable) as exc:
            app.state.db.release_analysis(device)
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except ProviderInvalidResponse as exc:
            app.state.db.release_analysis(device)
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except Exception:
            app.state.db.release_analysis(device)
            raise
        return LearningPackResponse(
            analysisId=analysis_id,
            inputSha256=digest,
            promptVersion=PROMPT_VERSION_V2,
            schemaVersion=SCHEMA_VERSION_V2,
            model=provider.model_used,
            package=package,
        )

    @app.post(
        "/v2/learning-pack/jobs",
        response_model=LearningPackJobCreateResponse,
        status_code=202,
    )
    async def create_learning_pack_job(
        payload: LearningPackRequest, device: str = Depends(device_id)
    ) -> LearningPackJobCreateResponse:
        provider: V2Provider | None = app.state.v2_provider
        if provider is None:
            raise HTTPException(status_code=503, detail="AI provider is not configured")
        if payload.visual_blocks and not vision_endpoints_from_env():
            raise HTTPException(
                status_code=503,
                detail=(
                    "Vision provider is not configured; OCR alone is not treated "
                    "as image understanding"
                ),
            )
        digest = canonical_learning_pack_sha256(payload)
        job, created = app.state.db.create_or_get_learning_pack_job(
            device, digest, recent_success_cutoff()
        )
        if created:
            app.state.learning_jobs.schedule(
                job["id"], device, digest, payload, provider
            )
        return LearningPackJobCreateResponse(
            jobId=job["id"], status=job["status"]
        )

    @app.get(
        "/v2/learning-pack/jobs/{job_id}",
        response_model=LearningPackJobResponse,
        response_model_exclude_none=True,
    )
    async def get_learning_pack_job(
        job_id: str, device: str = Depends(device_id)
    ) -> LearningPackJobResponse:
        job = app.state.db.get_learning_pack_job(device, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Learning pack job not found")
        return LearningPackJobResponse(**job_response_payload(job))
