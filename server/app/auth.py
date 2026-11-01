from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .accounts import require_active_account
from .security import token_digest

bearer_scheme = HTTPBearer(auto_error=False)


def device_identity(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    settings = request.app.state.settings
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
    device_id = request.app.state.db.find_device_by_token_hash(
        token_digest(credentials.credentials, settings.token_pepper)
    )
    if device_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid device token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    request.state.device_id = device_id
    account = request.app.state.db.account_for_device(device_id)
    request.state.account_id = None if account is None else str(account["id"])
    return device_id


def activated_device(
    request: Request,
    device_id: str = Depends(device_identity),
) -> str:
    require_active_account(request.app.state.db, request.app.state.settings, device_id)
    return device_id


def optional_device_identity(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str | None:
    """解析可选设备身份：没有令牌或令牌已失效时返回 None，不拦截匿名调用。

    用于「自助申请试用」这类既允许浏览器（带设备令牌、希望顺带激活）也允许
    不带身份的服务端调用的端点。令牌无效时不抛 401，避免已经消费掉短信验证码
    的申请因设备身份过期而整笔失败。
    """
    settings = request.app.state.settings
    if not settings.token_pepper:
        return None
    if credentials is None or credentials.scheme.lower() != "bearer":
        return None
    device_id = request.app.state.db.find_device_by_token_hash(
        token_digest(credentials.credentials, settings.token_pepper)
    )
    if device_id is not None:
        request.state.device_id = device_id
    return device_id
