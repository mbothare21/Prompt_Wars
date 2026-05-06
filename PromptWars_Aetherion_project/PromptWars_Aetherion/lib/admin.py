import base64
import hashlib
import hmac
import json
import os
import time

ADMIN_NAME = os.environ.get("ADMIN_NAME", "admin")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@prompt.com")
TOKEN_SECRET = os.environ.get("ADMIN_TOKEN_SECRET", "dev-secret")
TOKEN_TTL_MS = 1000 * 60 * 60  # 1 hour


def _normalize(value: str) -> str:
    return value.strip().lower()


def is_admin_email(email: str | None) -> bool:
    if not email:
        return False
    return _normalize(email) == _normalize(ADMIN_EMAIL)


def is_admin_identity(name: str | None, email: str | None) -> bool:
    if not name or not email:
        return False
    return _normalize(name) == _normalize(ADMIN_NAME) and is_admin_email(email)


def validate_admin_credentials(name: str, email: str) -> bool:
    return is_admin_identity(name, email)


def _base64url_encode(data: str) -> str:
    return base64.urlsafe_b64encode(data.encode()).decode().rstrip("=")


def create_admin_token(username: str) -> str:
    now = int(time.time() * 1000)
    payload = {"u": username, "iat": now, "exp": now + TOKEN_TTL_MS}
    payload_str = json.dumps(payload, separators=(",", ":"))
    sig = hmac.new(TOKEN_SECRET.encode(), payload_str.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).decode().rstrip("=")
    return f"{_base64url_encode(payload_str)}.{sig_b64}"


def verify_admin_token(token: str | None) -> bool:
    if not token:
        return False
    parts = token.split(".")
    if len(parts) != 2:
        return False
    try:
        payload_str = base64.urlsafe_b64decode(parts[0] + "==").decode("utf-8")
        expected_sig = (
            base64.urlsafe_b64encode(
                hmac.new(TOKEN_SECRET.encode(), payload_str.encode(), hashlib.sha256).digest()
            )
            .decode()
            .rstrip("=")
        )
        if expected_sig != parts[1]:
            return False
        payload = json.loads(payload_str)
        if int(time.time() * 1000) > payload["exp"]:
            return False
        return True
    except Exception:
        return False
