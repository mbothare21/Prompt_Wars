from fastapi import APIRouter
from fastapi.responses import JSONResponse

from PromptWars_Aetherion.lib.game_store import get_session, update_session
from PromptWars_Aetherion.lib.player_store import save_player
from PromptWars_Aetherion.lib.time_utils import now_ms
from PromptWars_Aetherion.db.player_persistence import persist_terminal_session

router = APIRouter()


@router.post("/api/penalty")
async def penalty(body: dict = None):
    if body is None:
        body = {}

    session_id = str(body.get("sessionId") or "")
    violation_type = str(body.get("violationType") or "TAB_SWITCH")

    session = await get_session(session_id)
    if not session:
        return JSONResponse({"error": "Invalid session"})

    if session.completed or session.status == "DISQUALIFIED":
        return JSONResponse({"status": "ALREADY_ENDED"})

    session.violations = (session.violations or 0) + 1
    session.penaltyTimeSec = (session.penaltyTimeSec or 0) + 15

    if session.violations >= 3:
        session.status = "DISQUALIFIED"
        session.completed = True
        session.player.completed = True
        session.player.completedAt = now_ms()
        session.player.attemptsPerRound = dict(session.attemptsPerRound)
        session.player.timeLimit = session.timeLimit
        session.player.gameStatus = "DISQUALIFIED"
        save_player(session.player)
        await update_session(session_id, session)
        try:
            await persist_terminal_session(session, "DISQUALIFIED")
        except Exception as e:
            print(f"[penalty] MongoDB disqualify error: {e}")
        return JSONResponse({
            "status": "DISQUALIFIED",
            "violations": session.violations,
            "violationType": violation_type,
            "message": "3 violations reached. You have been disqualified.",
        })

    await update_session(session_id, session)

    effective_limit = session.timeLimit - session.penaltyTimeSec * 1000
    remaining_time = effective_limit - (now_ms() - session.startTime)

    return JSONResponse({
        "status": "PENALTY_APPLIED",
        "violations": session.violations,
        "violationType": violation_type,
        "penaltyTimeSec": 15,
        "totalPenaltySec": session.penaltyTimeSec,
        "remainingTime": max(0, remaining_time),
        "violationsRemaining": 3 - session.violations,
    })
