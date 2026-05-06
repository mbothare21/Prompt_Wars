from fastapi import APIRouter
from fastapi.responses import JSONResponse

from PromptWars_Aetherion.lib.evaluator import compile_meta_prompt
from PromptWars_Aetherion.lib.game_store import get_session, update_session
from PromptWars_Aetherion.lib.time_utils import is_time_up, now_ms

router = APIRouter()


@router.post("/api/compile-meta-prompt")
async def compile_meta_prompt_route(body: dict = None):
    if body is None:
        body = {}

    session_id = str(body.get("sessionId") or "")
    meta_prompt = body.get("metaPrompt")

    if not session_id:
        return JSONResponse({"error": "Invalid session"}, status_code=400)

    if not isinstance(meta_prompt, str) or len(meta_prompt.strip()) < 3:
        return JSONResponse({"error": "Meta prompt must be at least 3 characters."}, status_code=400)

    session = await get_session(session_id)
    if not session:
        return JSONResponse({"error": "Invalid session"}, status_code=404)

    if session.completed or session.status == "DISQUALIFIED":
        return JSONResponse({"error": "Session is no longer active."}, status_code=409)

    if is_time_up(session):
        return JSONResponse({"error": "Time is up."}, status_code=409)

    round_ = session.rounds[session.currentRound - 1]
    if round_.type != "BONUS":
        return JSONResponse({"error": "Meta prompt preview is only available in the bonus round."}, status_code=400)

    if not session.bonusUnlocked:
        session.bonusUnlocked = True
        await update_session(session_id, session)

    try:
        compiled = await compile_meta_prompt(meta_prompt=meta_prompt, base_prompt=round_.input or "")
        penalty_ms = (session.penaltyTimeSec or 0) * 1000
        remaining = (session.timeLimit - penalty_ms) - (now_ms() - session.startTime)
        return JSONResponse({"status": "COMPILED", "compiledPrompt": compiled, "remainingTime": remaining})
    except Exception as e:
        print(f"[compile-meta-prompt] compile error: {e}")
        return JSONResponse({"error": "Failed to compile meta prompt."}, status_code=500)
