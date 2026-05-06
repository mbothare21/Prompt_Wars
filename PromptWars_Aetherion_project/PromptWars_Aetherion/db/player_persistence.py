import time
import os
from PromptWars_Aetherion.lib.admin import is_admin_email, is_admin_identity
from PromptWars_Aetherion.lib.types import GameSession, GameStatus


DEFAULT_PLAYER_COLLECTION_NAME = "playerDetails2"


def get_player_db_name() -> str | None:
    return (os.environ.get("PLAYER_DB_NAME") or os.environ.get("MONGO_DB_NAME") or "promptwars").strip()


def get_player_collection_name() -> str:
    return (os.environ.get("PLAYER_COLLECTION_NAME") or DEFAULT_PLAYER_COLLECTION_NAME).strip()


async def get_player_collection():
    from PromptWars_Aetherion.db.mongodb import get_db
    db = await get_db(get_player_db_name())
    return db[get_player_collection_name()] if db is not None else None


def _should_skip_persistence(session: GameSession) -> bool:
    return (
        not session.player.email or
        is_admin_identity(session.player.name, session.player.email)
    )


def _get_total_attempts(session: GameSession) -> int:
    return sum(session.attemptsPerRound.values())


async def _upsert_player_snapshot(session: GameSession, game_status: str) -> None:
    if _should_skip_persistence(session):
        return

    collection = await get_player_collection()
    if collection is None:
        return

    now = int(time.time() * 1000)
    completed_at_ms = session.player.completedAt if game_status != "IN_PROGRESS" else None
    from datetime import datetime, timezone

    set_fields: dict = {
        "name": session.player.name,
        "roundsPlayed": session.player.roundsPlayed,
        "timeTaken": max(0, now - session.startTime),
        "avgAccuracy": session.player.averageScore,
        "attemptsTaken": _get_total_attempts(session),
        "gameStatus": game_status,
        "lastActivityAt": datetime.now(tz=timezone.utc),
        "rounds": [r.model_dump() for r in (session.pendingRounds or [])],
    }
    if completed_at_ms is not None:
        set_fields["completedAt"] = datetime.fromtimestamp(completed_at_ms / 1000, tz=timezone.utc)

    set_on_insert: dict = {
        "email": session.player.email,
        "createdAt": datetime.fromtimestamp(
            (session.player.startedAt or session.startTime or now) / 1000, tz=timezone.utc
        ),
    }

    unset_fields: dict = {"responseReport": ""}
    if completed_at_ms is None:
        unset_fields["completedAt"] = ""

    await collection.update_one(
        {"email": session.player.email},
        {
            "$setOnInsert": set_on_insert,
            "$set": set_fields,
            "$unset": unset_fields,
        },
        upsert=True,
    )


async def find_completed_player_by_email(email: str) -> bool:
    if is_admin_email(email):
        return False
    collection = await get_player_collection()
    if collection is None:
        return False
    doc = await collection.find_one({"email": email, "completedAt": {"$exists": True}}, {"_id": 1})
    return doc is not None


async def find_any_player_attempt_by_email(email: str) -> bool:
    if is_admin_email(email):
        return False
    collection = await get_player_collection()
    if collection is None:
        return False
    doc = await collection.find_one({"email": email}, {"_id": 1})
    return doc is not None


async def ensure_player_record(session: GameSession) -> None:
    if _should_skip_persistence(session):
        return
    await _upsert_player_snapshot(session, "IN_PROGRESS")


async def persist_progress_snapshot(session: GameSession) -> None:
    await _upsert_player_snapshot(session, "IN_PROGRESS")


async def persist_terminal_session(session: GameSession, game_status: str) -> None:
    await _upsert_player_snapshot(session, game_status)
