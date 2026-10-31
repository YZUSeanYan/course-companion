from __future__ import annotations

import base64
import hashlib
import hmac
from cryptography.fernet import Fernet, InvalidToken


def _fernet(pepper: str) -> Fernet:
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(("lecsync-webhook:" + pepper).encode()).digest()))


def encrypt_webhook_secret(secret: str, pepper: str) -> str:
    return _fernet(pepper).encrypt(secret.encode()).decode()


def decrypt_webhook_secret(ciphertext: str, pepper: str) -> str:
    try:
        return _fernet(pepper).decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        raise ValueError("Webhook secret cannot be decrypted") from None


def admin_authorized(provided: str | None, expected: str | None) -> bool:
    return bool(expected and provided and hmac.compare_digest(provided, expected))
