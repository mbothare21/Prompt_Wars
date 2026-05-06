import json
import os
from datetime import datetime, timedelta, timezone
import redis.asyncio as aioredis
from PromptWars_Aetherion.lib.types import GameSession, StoredGameSession
from PromptWars_Aetherion.lib.rounds_store import get_rounds

_in_memory_sessions: dict[str, dict] = {}

_redis_url = os.environ.get("REDIS_URL", "").strip()
_redis_client: aioredis.Redis | None = None
_mongo_indexes_ready = False

PLAYER_KEY_PREFIX = "player:"
SESSION_KEY_PREFIX = "session:"
BINDING_TTL_SEC = 12 * 60 * 60   # 12 hours
SESSION_TTL_SEC = 75 * 60          # 75 minutes


def _get_redis() -> aioredis.Redis | None:
    global _redis_client
    if not _redis_url:
        return None
    if _redis_client is None:
        _redis_client = aioredis.from_url(_redis_url, decode_responses=True)
    return _redis_client


def _has_mongo_uri() -> bool:
    return bool((os.environ.get("MONGO_URI") or os.environ.get("MONGODB_URI") or "").strip())


def _session_store_mode() -> str:
    return (os.environ.get("SESSION_STORE") or "auto").strip().lower()


def _should_use_mongo_sessions() -> bool:
    mode = _session_store_mode()
    if mode in {"mongo", "mongodb"}:
        return True
    if mode == "memory":
        return False
    return _get_redis() is None and _has_mongo_uri()


def _get_session_db_name() -> str:
    return (os.environ.get("SESSION_DB_NAME") or os.environ.get("MONGO_DB_NAME") or "promptwars").strip()


def _get_session_collection_name() -> str:
    return (os.environ.get("SESSION_COLLECTION_NAME") or "gameSessions").strip()


def _get_binding_collection_name() -> str:
    return (os.environ.get("SESSION_BINDINGS_COLLECTION_NAME") or "sessionBindings").strip()


def _utc_now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _expires_in(seconds: int) -> datetime:
    return _utc_now() + timedelta(seconds=seconds)


async def _get_session_collection():
    if not _should_use_mongo_sessions():
        return None
    from PromptWars_Aetherion.db.mongodb import get_db
    db = await get_db(_get_session_db_name())
    return db[_get_session_collection_name()] if db is not None else None


async def _get_binding_collection():
    if not _should_use_mongo_sessions():
        return None
    from PromptWars_Aetherion.db.mongodb import get_db
    db = await get_db(_get_session_db_name())
    return db[_get_binding_collection_name()] if db is not None else None


async def _ensure_mongo_indexes() -> None:
    global _mongo_indexes_ready
    if _mongo_indexes_ready or not _should_use_mongo_sessions():
        return
    session_collection = await _get_session_collection()
    binding_collection = await _get_binding_collection()
    if session_collection is None or binding_collection is None:
        return
    await session_collection.create_index("expiresAt", expireAfterSeconds=0)
    await binding_collection.create_index("expiresAt", expireAfterSeconds=0)
    await binding_collection.create_index("sessionId")
    _mongo_indexes_ready = True


def _strip_session(session: GameSession) -> dict:
    data = session.model_dump()
    data.pop("rounds", None)
    return data


def _hydrate_session(stored: dict) -> GameSession:
    stored.pop("_id", None)
    stored.pop("expiresAt", None)
    stored.pop("createdAt", None)
    stored.pop("updatedAt", None)
    stored["rounds"] = [r.model_dump() for r in get_rounds()]
    return GameSession(**stored)


async def create_session(session_id: str, data: GameSession) -> None:
    r = _get_redis()
    stripped = _strip_session(data)
    if r is not None:
        await r.set(f"{SESSION_KEY_PREFIX}{session_id}", json.dumps(stripped), ex=SESSION_TTL_SEC)
        return
    if _should_use_mongo_sessions():
        await _ensure_mongo_indexes()
        collection = await _get_session_collection()
        if collection is not None:
            await collection.update_one(
                {"_id": session_id},
                {
                    "$set": {**stripped, "updatedAt": _utc_now(), "expiresAt": _expires_in(SESSION_TTL_SEC)},
                    "$setOnInsert": {"createdAt": _utc_now()},
                },
                upsert=True,
            )
            return
    _in_memory_sessions[session_id] = stripped


async def get_session(session_id: str) -> GameSession | None:
    r = _get_redis()
    if r is not None:
        raw = await r.get(f"{SESSION_KEY_PREFIX}{session_id}")
        if not raw:
            return None
        return _hydrate_session(json.loads(raw))
    if _should_use_mongo_sessions():
        collection = await _get_session_collection()
        if collection is not None:
            stored = await collection.find_one({"_id": session_id})
            if not stored:
                return None
            expires_at = stored.get("expiresAt")
            if isinstance(expires_at, datetime) and expires_at <= _utc_now():
                await collection.delete_one({"_id": session_id})
                return None
            return _hydrate_session(dict(stored))
    stored = _in_memory_sessions.get(session_id)
    return _hydrate_session(dict(stored)) if stored else None


async def update_session(session_id: str, data: GameSession) -> None:
    r = _get_redis()
    stripped = _strip_session(data)
    if r is not None:
        await r.set(f"{SESSION_KEY_PREFIX}{session_id}", json.dumps(stripped), keepttl=True)
        return
    if _should_use_mongo_sessions():
        await _ensure_mongo_indexes()
        collection = await _get_session_collection()
        if collection is not None:
            await collection.update_one(
                {"_id": session_id},
                {
                    "$set": {**stripped, "updatedAt": _utc_now()},
                    "$setOnInsert": {"createdAt": _utc_now(), "expiresAt": _expires_in(SESSION_TTL_SEC)},
                },
                upsert=True,
            )
            return
    _in_memory_sessions[session_id] = stripped


async def delete_session(session_id: str) -> None:
    r = _get_redis()
    if r is not None:
        await r.delete(f"{SESSION_KEY_PREFIX}{session_id}")
        return
    if _should_use_mongo_sessions():
        collection = await _get_session_collection()
        if collection is not None:
            await collection.delete_one({"_id": session_id})
            return
    _in_memory_sessions.pop(session_id, None)


def clear_sessions() -> None:
    _in_memory_sessions.clear()


# ── Email → SessionId binding ─────────────────────────────────────────────────

async def bind_email_to_session_id(email: str, session_id: str) -> None:
    r = _get_redis()
    if r is not None:
        await r.set(f"{PLAYER_KEY_PREFIX}{email}", session_id, ex=BINDING_TTL_SEC)
        return
    if _should_use_mongo_sessions():
        await _ensure_mongo_indexes()
        collection = await _get_binding_collection()
        if collection is not None:
            await collection.update_one(
                {"_id": email},
                {
                    "$set": {"sessionId": session_id, "updatedAt": _utc_now(), "expiresAt": _expires_in(BINDING_TTL_SEC)},
                    "$setOnInsert": {"createdAt": _utc_now()},
                },
                upsert=True,
            )


async def get_bound_session_id_for_email(email: str) -> str | None:
    r = _get_redis()
    if r is not None:
        val = await r.get(f"{PLAYER_KEY_PREFIX}{email}")
        return val
    if _should_use_mongo_sessions():
        collection = await _get_binding_collection()
        if collection is not None:
            doc = await collection.find_one({"_id": email})
            if not doc:
                return None
            expires_at = doc.get("expiresAt")
            if isinstance(expires_at, datetime) and expires_at <= _utc_now():
                await collection.delete_one({"_id": email})
                return None
            session_id = doc.get("sessionId")
            return session_id if isinstance(session_id, str) and session_id else None
    return None


async def clear_email_session_binding(email: str | None) -> None:
    if not email:
        return
    r = _get_redis()
    try:
        if r is not None:
            await r.delete(f"{PLAYER_KEY_PREFIX}{email}")
            return
        if _should_use_mongo_sessions():
            collection = await _get_binding_collection()
            if collection is not None:
                await collection.delete_one({"_id": email})
    except Exception:
        pass
