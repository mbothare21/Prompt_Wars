import asyncio
import time
from datetime import datetime, timezone
from typing import Optional

from PromptWars_Aetherion.lib.admin import is_admin_email
from PromptWars_Aetherion.lib.player_store import get_players
from PromptWars_Aetherion.lib.ranking import rank_players
from PromptWars_Aetherion.lib.types import Player
from PromptWars_Aetherion.lib.game_constants import SESSION_TIME_LIMIT_MS

CACHE_TTL_MS = 30_000
STALE_TTL_MS = 2 * 60_000

_cached_leaderboard: list[Player] | None = None
_last_fetch_time: int = 0
_inflight: asyncio.Task | None = None


def _to_timestamp(value) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return int(value.timestamp() * 1000)
    if isinstance(value, (int, float)):
        return int(value) if value > 0 else None
    if isinstance(value, str):
        try:
            return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)
        except ValueError:
            return None
    return None


def _normalize_db_player(player: dict) -> Player:
    started_at = _to_timestamp(player.get("createdAt")) or 0
    completed_at = _to_timestamp(player.get("completedAt"))
    raw_id = player.get("_id")
    if isinstance(raw_id, str) and raw_id.strip():
        pid = raw_id.strip()
    elif raw_id is not None:
        pid = str(raw_id)
    else:
        email = player.get("email") or player.get("name") or "unknown"
        pid = f"{email}-{started_at}"

    return Player(
        playerId=pid,
        name=player.get("name") or "Unknown",
        email=player.get("email"),
        startedAt=started_at,
        completedAt=completed_at,
        roundsPlayed=player.get("roundsPlayed") or 0,
        totalScore=0.0,
        averageScore=player.get("avgAccuracy") or 0.0,
        attempts=player.get("attemptsTaken") or 0,
        completed=True,
        timeLimit=SESSION_TIME_LIMIT_MS,
        gameStatus=player.get("gameStatus"),
    )


async def _fetch_leaderboard_from_db(now: int) -> list[Player]:
    global _cached_leaderboard, _last_fetch_time
    from PromptWars_Aetherion.db.player_persistence import get_player_collection

    collection = await get_player_collection()
    if collection is None:
        return _get_fallback_leaderboard()

    cursor = collection.find(
        {"completedAt": {"$exists": True}},
        {"name": 1, "email": 1, "roundsPlayed": 1, "timeTaken": 1,
         "avgAccuracy": 1, "attemptsTaken": 1, "gameStatus": 1, "createdAt": 1, "completedAt": 1},
    ).sort([("roundsPlayed", -1), ("avgAccuracy", -1), ("timeTaken", 1), ("attemptsTaken", 1)])

    docs = await cursor.to_list(length=None)
    ranked = rank_players([
        _normalize_db_player(d) for d in docs
        if not is_admin_email(d.get("email"))
    ])
    _cached_leaderboard = ranked
    _last_fetch_time = now
    return ranked


def _get_fallback_leaderboard() -> list[Player]:
    return rank_players([
        p for p in get_players()
        if not is_admin_email(p.email) and p.completed
    ][:100])


async def _refresh_leaderboard(now: int) -> list[Player]:
    global _inflight
    if _inflight is None or _inflight.done():
        _inflight = asyncio.create_task(_fetch_leaderboard_from_db(now))
    return await _inflight


async def get_leaderboard_response() -> dict:
    global _cached_leaderboard, _last_fetch_time
    now = int(time.time() * 1000)
    cache_age = now - _last_fetch_time

    if _cached_leaderboard is not None and cache_age < CACHE_TTL_MS:
        return {"leaderboard": [p.model_dump() for p in _cached_leaderboard]}

    if _cached_leaderboard is not None and cache_age < STALE_TTL_MS:
        asyncio.create_task(_fetch_leaderboard_from_db(now))
        return {"leaderboard": [p.model_dump() for p in _cached_leaderboard]}

    try:
        players = await _refresh_leaderboard(now)
        return {"leaderboard": [p.model_dump() for p in players]}
    except Exception:
        if _cached_leaderboard is not None:
            return {"leaderboard": [p.model_dump() for p in _cached_leaderboard]}
        return {"leaderboard": [p.model_dump() for p in _get_fallback_leaderboard()]}
