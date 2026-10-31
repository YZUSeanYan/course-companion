import hashlib
import hmac
import secrets


def new_device_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str, pepper: str) -> str:
    return hmac.new(
        pepper.encode("utf-8"), token.encode("utf-8"), hashlib.sha256
    ).hexdigest()
