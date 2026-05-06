from fastapi import APIRouter
from fastapi.responses import JSONResponse

from PromptWars_Aetherion.lib.leaderboard import get_leaderboard_response

router = APIRouter()


@router.get("/api/leaderboard")
async def leaderboard():
    try:
        payload = await get_leaderboard_response()
        return JSONResponse(
            payload,
            headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=120"},
        )
    except Exception as e:
        print(f"[leaderboard] {e}")
        return JSONResponse(
            {"leaderboard": []},
            headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=120"},
        )
