import uuid
import time
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from PromptWars_Aetherion.lib.game_constants import SESSION_TIME_LIMIT_MS
from PromptWars_Aetherion.lib.game_store import (
    create_session, get_session, update_session,
    bind_email_to_session_id, get_bound_session_id_for_email,
)
from PromptWars_Aetherion.lib.rounds_store import get_rounds
from PromptWars_Aetherion.lib.time_utils import is_time_up, now_ms
from PromptWars_Aetherion.lib.types import GameSession, Player
from PromptWars_Aetherion.db.employee_access import validate_employee_identity
from PromptWars_Aetherion.db.player_persistence import (
    find_completed_player_by_email,
    find_any_player_attempt_by_email,
    ensure_player_record,
    persist_terminal_session,
)

router = APIRouter()


@router.post("/api/start-game")
async def start_game(body: dict = None):
    if body is None:
        body = {}

    name = str(body.get("name") or "").strip() or "Guest"
    email = str(body.get("email") or "").strip() or None

    identity_check = await validate_employee_identity(name, email)
    if not identity_check.get("ok"):
        return JSONResponse({"error": identity_check.get("error", "Identity verification failed.")}, status_code=403)
    if identity_check.get("isAdmin"):
        return JSONResponse(
            {"error": "Admin credentials are reserved for the admin preview terminal and cannot start a player session."},
            status_code=403,
        )

    if email and not identity_check.get("isAttemptGameBypass"):
        try:
            existing_session_id = await get_bound_session_id_for_email(email)
            if existing_session_id:
                existing = await get_session(existing_session_id)
                if existing:
                    if existing.completed:
                        return JSONResponse({"status": "ALREADY_PLAYED", "message": "You have already completed the game."})
                    if not existing.completed and is_time_up(existing):
                        existing.status = "TIME_UP"
                        existing.completed = True
                        existing.player.completed = True
                        existing.player.completedAt = now_ms()
                        existing.player.attemptsPerRound = dict(existing.attemptsPerRound)
                        existing.player.timeLimit = existing.timeLimit
                        existing.player.gameStatus = "TIME_OVER"
                        await update_session(existing_session_id, existing)
                        try:
                            await persist_terminal_session(existing, "TIME_OVER")
                        except Exception as e:
                            print(f"[start-game] MongoDB expired-session error: {e}")
                        return JSONResponse({"status": "ALREADY_PLAYED", "message": "Your previous session has already expired."})
                    if not existing.completed and existing.status == "ACTIVE" and not is_time_up(existing):
                        remaining_time = max(0, existing.timeLimit - (now_ms() - existing.startTime))
                        return JSONResponse({
                            "status": "RESUME",
                            "sessionId": existing_session_id,
                            "startTime": existing.startTime,
                            "timeLimit": existing.timeLimit,
                            "remainingTime": remaining_time,
                        })
        except Exception as e:
            print(f"[start-game] Redis resume error: {e}")

        try:
            if await find_completed_player_by_email(email):
                return JSONResponse({"status": "ALREADY_PLAYED", "message": "You have already completed the game."})
            if await find_any_player_attempt_by_email(email):
                return JSONResponse({
                    "status": "ALREADY_PLAYED",
                    "message": "An attempt for this email is already on record. Resume the existing run while it is still active; otherwise contact an admin.",
                })
        except Exception as e:
            print(f"[start-game] MongoDB already-played check error: {e}")

    session_id = str(uuid.uuid4())
    now = now_ms()

    player = Player(
        playerId=str(uuid.uuid4()),
        name=name,
        email=email,
        startedAt=now,
        roundsPlayed=0,
        totalScore=0.0,
        averageScore=0.0,
        completed=False,
    )

    session = GameSession(
        sessionId=session_id,
        player=player,
        currentRound=1,
        rounds=get_rounds(),
        startTime=now,
        timeLimit=SESSION_TIME_LIMIT_MS,
        completed=False,
        status="ACTIVE",
        attemptsPerRound={},
        maxAttemptsPerRound=3,
        scores=[],
        bonusUnlocked=False,
        violations=0,
        penaltyTimeSec=0,
    )

    await create_session(session_id, session)

    if email:
        try:
            await bind_email_to_session_id(email, session_id)
        except Exception as e:
            print(f"[start-game] Redis bind error: {e}")
        try:
            await ensure_player_record(session)
        except Exception as e:
            print(f"[start-game] MongoDB create player error: {e}")

    return JSONResponse({
        "status": "NEW_GAME",
        "sessionId": session_id,
        "startTime": session.startTime,
        "timeLimit": session.timeLimit,
        "remainingTime": session.timeLimit,
    })
