from __future__ import annotations

import hashlib
import json

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import ProviderNotConfigured, Settings
from .db import Database, QuotaExceeded
from .provider import (
    PROMPT_VERSION,
    SCHEMA_VERSION,
    AIProvider,
    ProviderConfigurationError,
    ProviderInvalidResponse,
    ProviderUnavailable,
)
from .rate_limit import SlidingWindowRateLimiter
from .schemas import (
    AnalysisResponse,
    AnalyzeRequest,
    DeviceRegistrationResponse,
    HealthResponse,
    LearningPackage,
)
from .security import new_device_token, token_digest
from .v2_routes import register_v2_routes
from .v2_documents import register_document_routes

bearer_scheme = HTTPBearer(auto_error=False)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(title="Course Companion Learning Analysis", version="1.0.0")
    app.state.settings = settings
    app.state.db = Database(settings.database_path)
    register_v2_routes(app, settings)
    register_document_routes(app, settings)
    from .lecsync_routes import register_lecsync_routes
    register_lecsync_routes(app, settings)
    app.state.register_limiter = SlidingWindowRateLimiter(
        settings.register_rate_limit, settings.register_rate_window_seconds
    )
    app.state.analyze_limiter = SlidingWindowRateLimiter(
        settings.analyze_rate_limit, settings.analyze_rate_window_seconds
    )
    app.state.provider = AIProvider(settings) if settings.provider_configured else None

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(status="ok", providerConfigured=settings.provider_configured or app.state.lecsync.configured)

    @app.post(
        "/v1/devices/register",
        response_model=DeviceRegistrationResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def register_device(request: Request) -> DeviceRegistrationResponse:
        if not settings.token_pepper:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Device registration is unavailable: TOKEN_PEPPER is not configured",
            )
        client_host = request.client.host if request.client else "unknown"
        if not app.state.register_limiter.allow(client_host):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Device registration rate limit exceeded",
            )
        token = new_device_token()
        device_id = app.state.db.create_device(
            token_digest(token, settings.token_pepper)
        )
        return DeviceRegistrationResponse(
            deviceId=device_id, token=token, tokenType="bearer"
        )

    def authenticated_device(
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    ) -> str:
        if not settings.token_pepper:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Device authentication is unavailable: TOKEN_PEPPER is not configured",
            )
        if credentials is None or credentials.scheme.lower() != "bearer":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="A valid bearer device token is required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        device_id = app.state.db.find_device_by_token_hash(
            token_digest(credentials.credentials, settings.token_pepper)
        )
        if device_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid device token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return device_id

    @app.post("/v1/analyze", response_model=AnalysisResponse)
    async def analyze(
        payload: AnalyzeRequest,
        device_id: str = Depends(authenticated_device),
    ) -> AnalysisResponse:
        if not app.state.analyze_limiter.allow(device_id):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Analysis rate limit exceeded",
            )
        try:
            settings.require_provider()
        except ProviderNotConfigured as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
            ) from exc
        provider: AIProvider = app.state.provider
        canonical_input = json.dumps(
            payload.model_dump(by_alias=True, exclude_none=True),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        input_sha256 = hashlib.sha256(canonical_input).hexdigest()
        try:
            analysis_id = app.state.db.reserve_analysis(
                device_id, settings.device_daily_quota
            )
        except QuotaExceeded as exc:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Daily analysis quota exceeded",
            ) from exc
        try:
            package: LearningPackage = await provider.generate_package(payload)
            app.state.db.record_analysis(
                analysis_id=analysis_id,
                device_id=device_id,
                input_sha256=input_sha256,
                prompt_version=PROMPT_VERSION,
                schema_version=SCHEMA_VERSION,
                model=app.state.provider.model_used,
            )
        except (ProviderConfigurationError, ProviderUnavailable) as exc:
            app.state.db.release_analysis(device_id)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
            ) from exc
        except ProviderInvalidResponse as exc:
            app.state.db.release_analysis(device_id)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
            ) from exc
        except Exception:
            app.state.db.release_analysis(device_id)
            raise
        return AnalysisResponse(
            analysisId=analysis_id,
            inputSha256=input_sha256,
            promptVersion=PROMPT_VERSION,
            schemaVersion=SCHEMA_VERSION,
            model=app.state.provider.model_used,
            package=package,
        )

    return app


app = create_app()
