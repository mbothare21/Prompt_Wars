import asyncio
import os
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from PromptWars_Aetherion.lib.evaluator import evaluate_round, evaluate_meta_bonus_round
from PromptWars_Aetherion.lib.game_constants import ATTEMPT_LIMITS, PASS_THRESHOLDS
from PromptWars_Aetherion.lib.game_store import get_session, update_session
from PromptWars_Aetherion.lib.player_store import save_player
from PromptWars_Aetherion.lib.time_utils import is_time_up, now_ms
from PromptWars_Aetherion.lib.types import PendingRound
from PromptWars_Aetherion.db.player_persistence import persist_terminal_session, persist_progress_snapshot

router = APIRouter()

BONUS_SCORE_THRESHOLD = 0.92
EVALUATOR_TIMEOUT_S = float(os.environ.get("EVALUATOR_TIMEOUT_MS") or 15_000) / 1000


def _derive_player_metrics(pending_rounds: list | None) -> dict:
    best_by_round: dict[int, float] = {}
    for r in (pending_rounds or []):
        rn = r.round if hasattr(r, 'round') else r.get('round', 0)
        sc = r.score if hasattr(r, 'score') else r.get('score', 0.0)
        best_by_round[rn] = max(best_by_round.get(rn, 0.0), sc)
    rounds_played = len(best_by_round)
    total_score = sum(best_by_round.values())
    average_score = total_score / rounds_played if rounds_played > 0 else 0.0
    return {"roundsPlayed": rounds_played, "totalScore": total_score, "averageScore": average_score}


@router.post("/api/evaluate")
async def evaluate(body: dict = None):
    if body is None:
        body = {}

    session_id = str(body.get("sessionId") or "")
    prompt = body.get("prompt")
    answers = body.get("answers")
    meta_prompt = body.get("metaPrompt")

    session = await get_session(session_id)
    if not session:
        return JSONResponse({"error": "Invalid session"})

    if session.completed or session.status == "DISQUALIFIED":
        return JSONResponse({"status": "GAME_ALREADY_COMPLETED", "sessionStatus": session.status})

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
            print(f"[evaluate] MongoDB time-up error: {e}")
        return JSONResponse({"status": "GAME_OVER", "reason": "TIME_UP"})

    round_num = session.currentRound
    round_ = session.rounds[round_num - 1]
    total_rounds = len(session.rounds)

    if round_.type == "CLASSIFY":
        if not answers or not isinstance(answers, dict):
            return JSONResponse({"error": "Invalid answers"})
    elif round_.type == "BONUS":
        if not meta_prompt:
            return JSONResponse({"status": "INVALID_SUBMISSION", "message": "A meta-prompt is required"})
        if session.bonusAttempted:
            return JSONResponse({"error": "Already attempted"})
        session.bonusAttempted = True
    else:
        if not isinstance(prompt, str) or len(prompt.strip()) < 3:
            return JSONResponse({"error": "Invalid prompt"})

    round_num_str = str(round_num)
    session.attemptsPerRound[round_num_str] = session.attemptsPerRound.get(round_num_str, 0) + 1

    max_attempts = ATTEMPT_LIMITS.get(round_num)
    if max_attempts is not None and session.attemptsPerRound[round_num_str] > max_attempts:
        session.status = "FAILED"
        session.completed = True
        session.player.completed = True
        session.player.completedAt = now_ms()
        session.player.attemptsPerRound = dict(session.attemptsPerRound)
        session.player.timeLimit = session.timeLimit
        session.player.gameStatus = "FAILED"
        save_player(session.player)
        await update_session(session_id, session)
        try:
            await persist_terminal_session(session, "FAILED")
        except Exception as e:
            print(f"[evaluate] MongoDB attempts-exhausted error: {e}")
        return JSONResponse({
            "status": "NO_ATTEMPTS_LEFT",
            "round": round_num,
            "attempts": session.attemptsPerRound[round_num_str],
        })

    try:
        if round_.type == "BONUS":
            result = await asyncio.wait_for(
                evaluate_meta_bonus_round(meta_prompt=meta_prompt or "", base_prompt=round_.input or ""),
                timeout=EVALUATOR_TIMEOUT_S,
            )
        else:
            result = await asyncio.wait_for(
                evaluate_round(round_, prompt or "", answers),
                timeout=EVALUATOR_TIMEOUT_S,
            )
    except asyncio.TimeoutError:
        attempts_used = session.attemptsPerRound.get(round_num_str, 0)
        if attempts_used <= 1:
            session.attemptsPerRound.pop(round_num_str, None)
        else:
            session.attemptsPerRound[round_num_str] = attempts_used - 1
        if round_.type == "BONUS":
            session.bonusAttempted = False
        await update_session(session_id, session)
        return JSONResponse({"status": "EVALUATION_TIMEOUT", "retryable": True, "message": "Evaluation took too long. Please retry."})
    except Exception as e:
        attempts_used = session.attemptsPerRound.get(round_num_str, 0)
        if attempts_used <= 1:
            session.attemptsPerRound.pop(round_num_str, None)
        else:
            session.attemptsPerRound[round_num_str] = attempts_used - 1
        if round_.type == "BONUS":
            session.bonusAttempted = False
        await update_session(session_id, session)
        print(f"[evaluate] evaluator error: {e}")
        return JSONResponse({"status": "EVALUATION_ERROR", "retryable": True, "message": "Evaluation failed. Please retry."})

    final_score = result.get("finalScore", 0.0)
    progress = result.get("progress", 0)
    if round_.type == "BONUS":
        final_score = min(1.0, final_score * 1.5)
        progress = round(final_score * 100)

    if round_.type == "CLASSIFY":
        pending_prompt = answers
    elif round_.type == "BONUS":
        pending_prompt = {
            "metaPrompt": meta_prompt,
            "compiledPrompt": result.get("compiledPrompt"),
        }
    else:
        pending_prompt = prompt

    pending_output = result.get("output") or result.get("finalOutput") or ""

    session.pendingRounds = list(session.pendingRounds or []) + [
        PendingRound(
            round=round_num,
            attempts=session.attemptsPerRound.get(round_num_str, 1),
            score=final_score,
            prompt=pending_prompt,
            output=pending_output,
        )
    ]

    metrics = _derive_player_metrics(session.pendingRounds)
    session.player.roundsPlayed = metrics["roundsPlayed"]
    session.player.totalScore = metrics["totalScore"]
    session.player.averageScore = metrics["averageScore"]

    pass_threshold = PASS_THRESHOLDS.get(round_num, 0.60)

    if final_score >= pass_threshold:
        session.currentRound += 1
        if session.currentRound > 5:
            session.bonusUnlocked = True

        if session.currentRound > total_rounds:
            session.completed = True
            session.status = "COMPLETED"
            session.player.completed = True
            session.player.completedAt = now_ms()
            high_score_bonus = final_score >= BONUS_SCORE_THRESHOLD
            session.player.attemptsPerRound = dict(session.attemptsPerRound)
            session.player.timeLimit = session.timeLimit
            completed_status = "COMPLETED_WITH_BONUS" if session.player.roundsPlayed >= 6 else "COMPLETED"
            session.player.gameStatus = completed_status
            save_player(session.player)
            await update_session(session_id, session)
            try:
                await persist_terminal_session(session, completed_status)
            except Exception as e:
                print(f"[evaluate] MongoDB completion error: {e}")
            return JSONResponse({
                "status": "GAME_COMPLETED",
                "bonusUnlocked": session.bonusUnlocked,
                "highScoreBonus": high_score_bonus,
                **result,
                "finalScore": final_score,
                "progress": progress,
            })

        await update_session(session_id, session)
        try:
            await persist_progress_snapshot(session)
        except Exception as e:
            print(f"[evaluate] MongoDB progress snapshot error: {e}")
        return JSONResponse({
            "status": "ROUND_PASSED",
            "nextRound": session.currentRound,
            "attemptsThisRound": session.attemptsPerRound.get(round_num_str, 1),
            **result,
            "finalScore": final_score,
            "progress": progress,
        })

    if max_attempts is not None and session.attemptsPerRound.get(round_num_str, 0) >= max_attempts:
        session.status = "FAILED"
        session.completed = True
        session.player.completed = True
        session.player.completedAt = now_ms()
        session.player.attemptsPerRound = dict(session.attemptsPerRound)
        session.player.timeLimit = session.timeLimit
        session.player.gameStatus = "FAILED"
        save_player(session.player)
        await update_session(session_id, session)
        try:
            await persist_terminal_session(session, "FAILED")
        except Exception as e:
            print(f"[evaluate] MongoDB final-attempt failure error: {e}")
        return JSONResponse({
            "status": "NO_ATTEMPTS_LEFT",
            "round": round_num,
            "attempts": session.attemptsPerRound.get(round_num_str),
            **result,
            "finalScore": final_score,
            "progress": progress,
        })

    await update_session(session_id, session)
    try:
        await persist_progress_snapshot(session)
    except Exception as e:
        print(f"[evaluate] MongoDB progress snapshot error: {e}")

    attempts_used = session.attemptsPerRound.get(round_num_str, 1)
    attempts_remaining = (max_attempts - attempts_used) if max_attempts is not None else -1

    return JSONResponse({
        "status": "ROUND_FAILED",
        "attemptsThisRound": attempts_used,
        "attemptsRemaining": max(0, attempts_remaining) if max_attempts is not None else -1,
        "maxAttemptsThisRound": max_attempts if max_attempts is not None else -1,
        **result,
        "finalScore": final_score,
        "progress": progress,
    })
