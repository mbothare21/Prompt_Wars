import os
import re
from motor.motor_asyncio import AsyncIOMotorClient
from PromptWars_Aetherion.lib.admin import validate_admin_credentials

DEFAULT_COMPANY_EMAIL_DOMAIN = "calfus.com"
DEFAULT_EMPLOYEE_DB_NAME = "promptwars"
DEFAULT_EMPLOYEE_COLLECTION_NAME = "employeeDetails"
DEFAULT_ATTEMPT_GAME_BYPASS_LOCAL_PART = "attempt-game"


def _normalize_name(name: str) -> str:
    return re.sub(r'\s+', ' ', name.strip()).lower()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _get_company_domain() -> str:
    return (os.environ.get("COMPANY_EMAIL_DOMAIN") or DEFAULT_COMPANY_EMAIL_DOMAIN).strip().lower()


def _get_employee_db_name() -> str:
    return (os.environ.get("EMPLOYEE_DB_NAME") or DEFAULT_EMPLOYEE_DB_NAME).strip()


def _get_employee_collection_name() -> str:
    return (os.environ.get("EMPLOYEE_COLLECTION_NAME") or DEFAULT_EMPLOYEE_COLLECTION_NAME).strip()


def _get_attempt_game_bypass_email() -> str:
    override = (os.environ.get("ATTEMPT_GAME_BYPASS_EMAIL") or "").strip()
    return override if override else f"{DEFAULT_ATTEMPT_GAME_BYPASS_LOCAL_PART}@{_get_company_domain()}"


def is_attempt_game_bypass_email(email: str | None) -> bool:
    if not email:
        return False
    return _normalize_email(email) == _normalize_email(_get_attempt_game_bypass_email())


async def _find_employee_by_email(email: str) -> dict | None:
    from PromptWars_Aetherion.db.mongodb import get_db
    employee_db_name = _get_employee_db_name()
    db = await get_db(employee_db_name)
    if db is None:
        raise RuntimeError("MongoDB unavailable")

    employee_collection = _get_employee_collection_name()

    escaped = re.escape(email)
    record = await db[employee_collection].find_one(
        {"empMail": re.compile(f"^{escaped}$", re.IGNORECASE)},
        {"_id": 0, "empName": 1, "empMail": 1},
    )
    if record and record.get("empMail"):
        return record
    return None


async def validate_employee_identity(name: str, email: str | None) -> dict:
    trimmed_name = name.strip()
    trimmed_email = (email or "").strip()

    if not trimmed_name or not trimmed_email:
        return {"ok": False, "error": "Please enter your full name and company email."}

    if validate_admin_credentials(trimmed_name, trimmed_email):
        return {"ok": True, "isAdmin": True}

    if is_attempt_game_bypass_email(trimmed_email):
        return {"ok": True, "isAdmin": False, "isAttemptGameBypass": True}

    domain = _get_company_domain()
    if domain and not _normalize_email(trimmed_email).endswith(f"@{domain}"):
        return {"ok": False, "error": f"Use your approved @{domain} company email."}

    try:
        employee = await _find_employee_by_email(trimmed_email)
        if not employee or not employee.get("empName") or \
                _normalize_name(employee["empName"]) != _normalize_name(trimmed_name):
            return {
                "ok": False,
                "error": "This name and email pair does not match the employee directory.",
            }
        return {"ok": True, "isAdmin": False}
    except Exception as e:
        print(f"[employeeAccess] employee directory lookup failed: {e}")
        return {
            "ok": False,
            "error": "Employee directory verification is unavailable. Please try again.",
        }
