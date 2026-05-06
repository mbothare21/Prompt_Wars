from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from PromptWars_Aetherion.lib.admin import verify_admin_token
from PromptWars_Aetherion.lib.game_constants import ATTEMPT_LIMITS
from PromptWars_Aetherion.lib.game_store import get_session, update_session
from PromptWars_Aetherion.lib.player_store import save_player
from PromptWars_Aetherion.lib.rounds_store import get_rounds
from PromptWars_Aetherion.lib.time_utils import is_time_up, now_ms
from PromptWars_Aetherion.db.player_persistence import persist_terminal_session

router = APIRouter()


@router.post("/api/get-round")
async def get_round(request: Request, body: dict = None):
    if body is None:
        body = {}

    auth_header = request.headers.get("authorization", "")
    admin_token = auth_header[7:] if auth_header.startswith("Bearer ") else None

    if admin_token and verify_admin_token(admin_token):
        try:
            round_number = int(body.get("roundNumber", 0))
            rounds = get_rounds()
            if round_number < 1 or round_number > len(rounds):
                return JSONResponse({"error": "Invalid roundNumber"})
            round_ = rounds[round_number - 1]
            max_attempts = ATTEMPT_LIMITS.get(round_number, -1)
            return JSONResponse({
                "status": "ADMIN",
                "roundNumber": round_.roundNumber,
                "instruction": round_.instruction,
                "originalPrompt": round_.originalPrompt,
                "input": round_.input,
                "referenceExample": round_.referenceExample,
                "challenge": round_.input,
                "expectedOutput": round_.expectedOutput,
                "roundType": round_.type,
                "constraints": None if round_.type == "BONUS" else round_.constraints,
                "attemptsThisRound": 0,
                "maxAttemptsPerRound": 3,
                "maxAttemptsThisRound": max_attempts,
                "promptParts": [p.model_dump() for p in round_.promptParts] if round_.promptParts else None,
                "remainingTime": None,
            })
        except Exception:
            return JSONResponse({"error": "Invalid request"})

    session_id = str(body.get("sessionId") or "")
    session = await get_session(session_id)

    if not session:
        return JSONResponse({"error": "Invalid session"})

    if session.status == "DISQUALIFIED":
        return JSONResponse({"status": "DISQUALIFIED", "sessionStatus": session.status})

    if session.status == "FAILED":
        return JSONResponse({"status": "GAME_OVER", "sessionStatus": session.status, "reason": "ATTEMPTS_EXHAUSTED"})

    if session.completed and session.status == "COMPLETED":
        return JSONResponse({"status": "GAME_COMPLETED", "sessionStatus": session.status, "bonusUnlocked": session.bonusUnlocked})

    if is_time_up(session):
        session.status = "TIME_UP"
        session.completed = True
        session.player.completed = True
        session.player.completedAt = now_ms()
        session.player.attemptsPerRound = dict(session.attemptsPerRound)
        session.player.timeLimit = session.timeLimit
        session.player.gameStatus = "TIME_OVER"
        save_player(session.player)
        await update_session(session_id, session)
        try:
            await persist_terminal_session(session, "TIME_OVER")
        except Exception as e:
            print(f"[get-round] MongoDB time-up error: {e}")
        return JSONResponse({"status": "GAME_OVER", "reason": "TIME_UP"})

    if session.completed:
        return JSONResponse({
            "status": "GAME_OVER",
            "sessionStatus": session.status,
            "reason": "TIME_UP" if session.status == "TIME_UP" else None,
        })

    round_ = session.rounds[session.currentRound - 1]
    round_num = session.currentRound
    max_attempts = ATTEMPT_LIMITS.get(round_num, -1)

    if round_.type == "BONUS" and not session.bonusUnlocked:
        session.bonusUnlocked = True
        await update_session(session_id, session)

    penalty_ms = (session.penaltyTimeSec or 0) * 1000
    remaining = (session.timeLimit - penalty_ms) - (now_ms() - session.startTime)

    return JSONResponse({
        "status": "ACTIVE",
        "roundNumber": session.currentRound,
        "instruction": round_.instruction,
        "originalPrompt": round_.originalPrompt,
        "input": round_.input,
        "referenceExample": round_.referenceExample,
        "challenge": round_.input,
        "expectedOutput": round_.expectedOutput,
        "roundType": round_.type,
        "constraints": None if round_.type == "BONUS" else (round_.constraints.model_dump() if hasattr(round_.constraints, 'model_dump') else round_.constraints),
        "attemptsThisRound": session.attemptsPerRound.get(str(round_num), 0),
        "maxAttemptsPerRound": session.maxAttemptsPerRound,
        "maxAttemptsThisRound": max_attempts,
        "promptParts": [p.model_dump() for p in round_.promptParts] if round_.promptParts else None,
        "remainingTime": remaining,
    })
