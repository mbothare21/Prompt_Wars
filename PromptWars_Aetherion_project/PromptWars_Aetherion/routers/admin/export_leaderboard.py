from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from PromptWars_Aetherion.lib.admin import is_admin_email, verify_admin_token
from PromptWars_Aetherion.lib.admin_players import (
    to_admin_player_export, sort_admin_players, get_fallback_admin_player_exports,
)
from PromptWars_Aetherion.db.player_persistence import get_player_collection

router = APIRouter()


@router.get("/api/admin/export-leaderboard")
async def admin_export_leaderboard(request: Request):
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not verify_admin_token(token):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        collection = await get_player_collection()
        if collection is None:
            return JSONResponse({"players": get_fallback_admin_player_exports()})

        cursor = collection.find(
            {},
            {"name": 1, "email": 1, "roundsPlayed": 1, "timeTaken": 1,
             "avgAccuracy": 1, "attemptsTaken": 1, "gameStatus": 1, "createdAt": 1, "completedAt": 1, "rounds": 1},
        ).sort([("roundsPlayed", -1), ("avgAccuracy", -1), ("timeTaken", 1), ("attemptsTaken", 1)])
        docs = await cursor.to_list(length=None)

        filtered = [d for d in docs if not is_admin_email(d.get("email"))]
        normalized = [{"_id": str(d.get("_id", "")), **{k: v for k, v in d.items() if k != "_id"}} for d in filtered]
        sorted_docs = sort_admin_players(normalized)
        players = [to_admin_player_export(d, i).to_dict() for i, d in enumerate(sorted_docs)]
        return JSONResponse({"players": players})
    except Exception as e:
        print(f"[admin/export-leaderboard] {e}")
        return JSONResponse({"players": get_fallback_admin_player_exports()})
