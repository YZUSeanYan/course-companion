from __future__ import annotations

import hashlib
import json
import logging
import time
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .account_schemas import AccountActivateRequest, AccountStatusResponse
from .accounts import (
    account_state,
    account_status_payload,
    normalize_phone,
    resolve_quota_subject,
)
from .activation import register_activation_routes, verify_activation_code
from .auth import activated_device, device_identity
from .config import ProviderNotConfigured, Settings
from .db import (
    AccountDisabled,
    AccountError,
    AccountExpired,
    Database,
    QuotaExceeded,
)
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
from .security import new_device_token, phone_digest, token_digest
from .sync_routes import register_sync_routes
from .v2_routes import register_v2_routes
from .v2_documents import register_document_routes

logger = logging.getLogger(__name__)


def _quota_message(exc: QuotaExceeded) -> str:
    limit = exc.limit
    used = exc.used
    if exc.scope == "ai_pack":
        return f"今日 AI 学习包额度已用完（{used}/{limit}），明天再来或联系管理员调整额度"
    if exc.scope == "audio":
        limit_minutes = round(float(limit) / 60.0, 1) if limit is not None else 0
        used_minutes = round(float(used) / 60.0, 1) if used is not None else 0
        return f"今日云端音频额度已用完（{used_minutes}/{limit_minutes} 分钟），明天再来或联系管理员调整额度"
    if exc.scope == "text":
        return f"今日翻译字符额度已用完（{used}/{limit}），明天再来或联系管理员调整额度"
    if exc.scope == "document":
        return f"今日文档解析额度已用完（{used}/{limit}），明天再来或联系管理员调整额度"
    return "今日额度已用完，请明天再试或联系管理员"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(title="Course Companion Learning Analysis", version="1.2.0")
    app.state.settings = settings
    app.state.db = Database(settings.database_path, settings.usage_timezone)
    if settings.web_cors_origins:
        # 网页版与网关不同源部署时的显式白名单；同源部署（网关托管 /web/）无需开启。
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.web_cors_origins),
            allow_credentials=False,
            allow_methods=["GET", "POST", "DELETE"],
            allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
            expose_headers=["X-Zhixi-Error-Code", "X-Zhixi-Quota-Scope", "X-Zhixi-Quota-Limit", "X-Zhixi-Quota-Used"],
        )
    register_v2_routes(app, settings)
    register_document_routes(app, settings)
    from .lecsync_routes import register_lecsync_routes
    register_lecsync_routes(app, settings)
    from .admin_routes import register_admin_routes
    register_admin_routes(app, settings)
    from .trial_routes import register_trial_routes
    register_trial_routes(app, settings)
    register_activation_routes(app, settings)
    register_sync_routes(app, settings)
    from .app_config import register_app_config_routes
    register_app_config_routes(app, settings)
    app.state.register_limiter = SlidingWindowRateLimiter(
        settings.register_rate_limit, settings.register_rate_window_seconds
    )
    app.state.analyze_limiter = SlidingWindowRateLimiter(
        settings.analyze_rate_limit, settings.analyze_rate_window_seconds
    )
    app.state.activation_limiter = SlidingWindowRateLimiter(10, 3600)
    app.state.provider = AIProvider(settings) if settings.provider_configured else None

    @app.exception_handler(AccountError)
    async def account_error_handler(request: Request, exc: AccountError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": str(exc)},
            headers={"X-Zhixi-Error-Code": exc.code},
        )

    @app.exception_handler(QuotaExceeded)
    async def quota_error_handler(request: Request, exc: QuotaExceeded) -> JSONResponse:
        headers = {"X-Zhixi-Error-Code": "quota_exceeded"}
        if exc.scope:
            headers["X-Zhixi-Quota-Scope"] = exc.scope
        if exc.limit is not None:
            headers["X-Zhixi-Quota-Limit"] = str(exc.limit)
        if exc.used is not None:
            headers["X-Zhixi-Quota-Used"] = str(exc.used)
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"detail": _quota_message(exc)},
            headers=headers,
        )

    @app.middleware("http")
    async def record_request_metrics(request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        path = request.url.path
        if path.startswith(("/v1/", "/v2/")):
            route = request.scope.get("route")
            try:
                app.state.db.record_api_request(
                    device_id=getattr(request.state, "device_id", None),
                    account_id=getattr(request.state, "account_id", None),
                    method=request.method,
                    route=getattr(route, "path", path),
                    status=response.status_code,
                    duration_ms=int((time.perf_counter() - started) * 1000),
                )
            except Exception:  # Metrics must never break an API response.
                logger.exception("Failed to record API request metrics")
        if path.startswith("/admin"):
            response.headers.setdefault("Cache-Control", "no-store")
            response.headers.setdefault("X-Frame-Options", "DENY")
            response.headers.setdefault("X-Content-Type-Options", "nosniff")
            response.headers.setdefault("Referrer-Policy", "no-referrer")
            response.headers.setdefault(
                "Content-Security-Policy",
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; "
                "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
            )
        return response

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

    @app.post("/v1/accounts/activate", response_model=AccountStatusResponse)
    def activate_account(
        payload: AccountActivateRequest,
        request: Request,
        device_id: str = Depends(device_identity),
    ) -> AccountStatusResponse:
        if not app.state.activation_limiter.allow(device_id):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="激活尝试过于频繁，请稍后再试",
            )
        if not settings.token_pepper:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Account activation is unavailable: TOKEN_PEPPER is not configured",
            )
        try:
            phone = normalize_phone(payload.phone)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
            ) from exc
        if payload.code is None and settings.require_activation_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="该账号已启用验证码保护，请先获取短信验证码后再激活",
                headers={"X-Zhixi-Error-Code": "activation_code_required"},
            )
        db: Database = app.state.db
        account = db.account_by_phone_hash(phone_digest(phone, settings.token_pepper))
        if account is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="该手机号还没有试用额度，可自助申请试用或联系管理员添加",
                headers={"X-Zhixi-Error-Code": "account_not_found"},
            )
        state = account_state(account, db.today())
        if state == "disabled":
            raise AccountDisabled()
        if state == "expired":
            raise AccountExpired(str(account["valid_until"]))
        if payload.code is not None:
            verify_activation_code(db, settings, phone, payload.code)
        db.bind_device(str(account["id"]), device_id, int(account["max_devices"]))
        request.state.account_id = str(account["id"])
        return AccountStatusResponse(
            **account_status_payload(db, settings, device_id)
        )

    @app.get("/v1/accounts/me", response_model=AccountStatusResponse)
    def account_me(
        request: Request,
        device_id: str = Depends(device_identity),
    ) -> AccountStatusResponse:
        return AccountStatusResponse(
            **account_status_payload(app.state.db, settings, device_id)
        )

    @app.post("/v1/analyze", response_model=AnalysisResponse)
    async def analyze(
        payload: AnalyzeRequest,
        device_id: str = Depends(activated_device),
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
        subject = resolve_quota_subject(app.state.db, settings, device_id)
        analysis_id = app.state.db.reserve_analysis(
            device_id, subject.limits.ai_packs, subject.account_id
        )
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
            app.state.db.release_analysis(device_id, subject.account_id)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
            ) from exc
        except ProviderInvalidResponse as exc:
            app.state.db.release_analysis(device_id, subject.account_id)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
            ) from exc
        except Exception:
            app.state.db.release_analysis(device_id, subject.account_id)
            raise
        return AnalysisResponse(
            analysisId=analysis_id,
            inputSha256=input_sha256,
            promptVersion=PROMPT_VERSION,
            schemaVersion=SCHEMA_VERSION,
            model=app.state.provider.model_used,
            package=package,
        )

    if settings.admin_dist_dir and Path(settings.admin_dist_dir).is_dir():
        app.mount(
            "/admin",
            StaticFiles(directory=settings.admin_dist_dir, html=True),
            name="admin-ui",
        )

    return app


app = create_app()
