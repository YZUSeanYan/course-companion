import base64
import hashlib
import hmac
import secrets
import time

from cryptography.fernet import Fernet, InvalidToken


def new_device_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str, pepper: str) -> str:
    return hmac.new(
        pepper.encode("utf-8"), token.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def phone_digest(phone: str, pepper: str) -> str:
    return hmac.new(
        pepper.encode("utf-8"), ("account-phone:" + phone).encode("utf-8"), hashlib.sha256
    ).hexdigest()


def _account_fernet(key: str) -> Fernet:
    derived = hashlib.sha256(("account-phone-encryption:" + key).encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(derived))


def encrypt_account_phone(phone: str, key: str) -> str:
    return _account_fernet(key).encrypt(phone.encode("utf-8")).decode("ascii")


def decrypt_account_phone(ciphertext: str, key: str) -> str:
    try:
        return _account_fernet(key).decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        raise ValueError("Account phone cannot be decrypted") from None


def admin_session_value(secret: str, expires_epoch: int) -> str:
    payload = f"admin-session:{expires_epoch}"
    signature = hmac.new(
        secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return f"{expires_epoch}.{signature}"


def verify_admin_session(secret: str, value: str | None, now: int | None = None) -> int | None:
    if not value:
        return None
    expires_raw, separator, signature = value.partition(".")
    if not separator or not expires_raw.isdigit() or not signature:
        return None
    expires = int(expires_raw)
    current = int(time.time()) if now is None else now
    if expires <= current:
        return None
    expected = admin_session_value(secret, expires)
    if not hmac.compare_digest(value, expected):
        return None
    return expires
