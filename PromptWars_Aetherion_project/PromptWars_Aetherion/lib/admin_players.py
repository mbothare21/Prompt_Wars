from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Optional
from PromptWars_Aetherion.lib.admin import is_admin_email
from PromptWars_Aetherion.lib.player_store import get_players
from PromptWars_Aetherion.lib.ranking import rank_players, compare_competitive_standing
from PromptWars_Aetherion.lib.types import Player, GameStatus


class AdminRound:
    def __init__(self, round: int, attempts: int, score: float, prompt: Any, output: str):
        self.round = round
        self.attempts = attempts
        self.score = score
        self.prompt = prompt
        self.output = output

    def to_dict(self) -> dict:
        return {"round": self.round, "attempts": self.attempts, "score": self.score, "prompt": self.prompt, "output": self.output}


class AdminPlayerSummary:
    def __init__(self, playerId: str, name: str, email: Optional[str], roundsPlayed: int,
                 timeTakenSec: int, averageScore: float, attemptsUsed: int, completed: bool, gameStatus: Optional[str]):
        self.playerId = playerId
        self.name = name
        self.email = email
        self.roundsPlayed = roundsPlayed
        self.timeTakenSec = timeTakenSec
        self.averageScore = averageScore
        self.attemptsUsed = attemptsUsed
        self.completed = completed
        self.gameStatus = gameStatus

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v is not None}


class AdminPlayerExport:
    def __init__(self, _id: str, name: str, email: Optional[str], roundsPlayed: int,
                 timeTaken: int, avgAccuracy: float, attemptsTaken: int, gameStatus: str,
                 createdAt: Optional[str], completedAt: Optional[str], rounds: list[dict]):
        self._id = _id
        self.name = name
        self.email = email
        self.roundsPlayed = roundsPlayed
        self.timeTaken = timeTaken
        self.avgAccuracy = avgAccuracy
        self.attemptsTaken = attemptsTaken
        self.gameStatus = gameStatus
        self.createdAt = createdAt
        self.completedAt = completedAt
        self.rounds = rounds

    def to_dict(self) -> dict:
        d = {"_id": self._id, "name": self.name, "roundsPlayed": self.roundsPlayed,
             "timeTaken": self.timeTaken, "avgAccuracy": self.avgAccuracy,
             "attemptsTaken": self.attemptsTaken, "gameStatus": self.gameStatus,
             "rounds": self.rounds}
        if self.email:
            d["email"] = self.email
        if self.createdAt:
            d["createdAt"] = self.createdAt
        if self.completedAt:
            d["completedAt"] = self.completedAt
        return d


def _to_finite(value: Any, fallback: float = 0.0) -> float:
    try:
        v = float(value)
        return v if v == v and abs(v) != float("inf") else fallback
    except (TypeError, ValueError):
        return fallback


def _to_iso(value: Any) -> Optional[str]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.isoformat() if not (value.year == 1 and value.month == 1) else None
    if isinstance(value, (int, float)):
        v = float(value)
        if v <= 0 or v != v:
            return None
        return datetime.fromtimestamp(v / 1000, tz=timezone.utc).isoformat()
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
        except ValueError:
            return None
    return None


def _to_str(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    v = value.strip()
    return v if v else None


def _normalize_rounds(value: Any) -> list[dict]:
    if not isinstance(value, list):
        return []
    result = []
    for r in value:
        if not isinstance(r, dict):
            continue
        result.append({
            "round": int(_to_finite(r.get("round"))),
            "attempts": int(_to_finite(r.get("attempts"))),
            "score": _to_finite(r.get("score")),
            "prompt": r.get("prompt"),
            "output": _to_str(r.get("output")) or "",
        })
    return result


def _is_completed_status(status: str) -> bool:
    return status in ("COMPLETED", "COMPLETED_WITH_BONUS")


def _normalize_doc(doc: dict, index: int = 0) -> dict:
    name = _to_str(doc.get("name")) or "Unknown"
    email = _to_str(doc.get("email"))
    created_at = _to_iso(doc.get("createdAt"))
    completed_at = _to_iso(doc.get("completedAt"))
    raw_id = doc.get("_id")
    if isinstance(raw_id, str) and raw_id.strip():
        pid = raw_id.strip()
    elif raw_id is not None:
        pid = str(raw_id)
        if pid == "[object Object]":
            pid = f"{email or name.lower().replace(' ', '-')}-{created_at or completed_at or f'idx-{index}'}"
    else:
        pid = f"{email or name.lower().replace(' ', '-')}-{created_at or completed_at or f'idx-{index}'}"

    return {
        "id": pid,
        "name": name,
        "email": email,
        "roundsPlayed": max(0, int(_to_finite(doc.get("roundsPlayed")))),
        "timeTaken": max(0, int(_to_finite(doc.get("timeTaken")))),
        "avgAccuracy": _to_finite(doc.get("avgAccuracy")),
        "attemptsTaken": max(0, int(_to_finite(doc.get("attemptsTaken")))),
        "gameStatus": _to_str(doc.get("gameStatus")) or "IN_PROGRESS",
        "createdAt": created_at,
        "completedAt": completed_at,
        "rounds": _normalize_rounds(doc.get("rounds")),
    }


def to_admin_player_summary(doc: dict, index: int = 0) -> AdminPlayerSummary:
    n = _normalize_doc(doc, index)
    time_ms = n["timeTaken"]
    time_sec = round(time_ms / 1000 if time_ms > 10_000 else time_ms)
    return AdminPlayerSummary(
        playerId=n["id"],
        name=n["name"],
        email=n["email"],
        roundsPlayed=n["roundsPlayed"],
        timeTakenSec=time_sec,
        averageScore=n["avgAccuracy"],
        attemptsUsed=n["attemptsTaken"],
        completed=_is_completed_status(n["gameStatus"]),
        gameStatus=n["gameStatus"],
    )


def to_admin_player_export(doc: dict, index: int = 0) -> AdminPlayerExport:
    n = _normalize_doc(doc, index)
    return AdminPlayerExport(
        _id=n["id"],
        name=n["name"],
        email=n["email"],
        roundsPlayed=n["roundsPlayed"],
        timeTaken=n["timeTaken"],
        avgAccuracy=n["avgAccuracy"],
        attemptsTaken=n["attemptsTaken"],
        gameStatus=n["gameStatus"],
        createdAt=n["createdAt"],
        completedAt=n["completedAt"],
        rounds=n["rounds"],
    )


def sort_admin_players(players: list[dict]) -> list[dict]:
    def _sort_key(p: dict):
        score = _to_finite(p.get("avgAccuracy"))
        time_ms = int(_to_finite(p.get("timeTaken")))
        rounds = int(_to_finite(p.get("roundsPlayed")))
        attempts = int(_to_finite(p.get("attemptsTaken")))
        name = _to_str(p.get("name")) or ""

        from PromptWars_Aetherion.lib.ranking import get_accuracy_time_composite_score
        perf = get_accuracy_time_composite_score(score, time_ms)
        avg_att = attempts / rounds if rounds > 0 else attempts
        return (-rounds, -perf, avg_att, attempts, name)

    return sorted(players, key=_sort_key)


def _get_memory_players() -> list[Player]:
    return rank_players([p for p in get_players() if not is_admin_email(p.email)])


def get_fallback_admin_player_summaries() -> list[dict]:
    return [
        to_admin_player_summary({
            "_id": p.playerId,
            "name": p.name,
            "email": p.email,
            "roundsPlayed": p.roundsPlayed,
            "timeTaken": max(0, (p.completedAt or 0) - p.startedAt) if p.completedAt else 0,
            "avgAccuracy": p.averageScore,
            "attemptsTaken": sum(p.attemptsPerRound.values()) if p.attemptsPerRound else 0,
            "gameStatus": p.gameStatus or ("COMPLETED" if p.completed else "IN_PROGRESS"),
            "createdAt": p.startedAt,
            "completedAt": p.completedAt,
            "rounds": [],
        }, i).to_dict()
        for i, p in enumerate(_get_memory_players())
    ]


def get_fallback_admin_player_exports() -> list[dict]:
    return [
        to_admin_player_export({
            "_id": p.playerId,
            "name": p.name,
            "email": p.email,
            "roundsPlayed": p.roundsPlayed,
            "timeTaken": max(0, (p.completedAt or 0) - p.startedAt) if p.completedAt else 0,
            "avgAccuracy": p.averageScore,
            "attemptsTaken": sum(p.attemptsPerRound.values()) if p.attemptsPerRound else 0,
            "gameStatus": p.gameStatus or ("COMPLETED" if p.completed else "IN_PROGRESS"),
            "createdAt": p.startedAt,
            "completedAt": p.completedAt,
            "rounds": [],
        }, i).to_dict()
        for i, p in enumerate(_get_memory_players())
    ]
