from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from PromptWars_Aetherion.lib.admin import is_admin_email, verify_admin_token
from PromptWars_Aetherion.lib.admin_players import to_admin_player_export
from PromptWars_Aetherion.db.player_persistence import get_player_collection

router = APIRouter()


@router.get("/api/admin/player-responses")
async def admin_player_responses(request: Request, email: str = ""):
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not verify_admin_token(token):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    email = email.strip().lower()
    if not email:
        return JSONResponse({"error": "Email is required"}, status_code=400)
    if is_admin_email(email):
        return JSONResponse({"error": "Player not found"}, status_code=404)

    try:
        collection = await get_player_collection()
        if collection is None:
            return JSONResponse({"error": "Player responses require MongoDB persistence"}, status_code=503)

        doc = await collection.find_one(
            {"email": email},
            {"name": 1, "email": 1, "roundsPlayed": 1, "timeTaken": 1,
             "avgAccuracy": 1, "attemptsTaken": 1, "gameStatus": 1, "createdAt": 1, "completedAt": 1, "rounds": 1},
        )
        if not doc:
            return JSONResponse({"error": "Player not found"}, status_code=404)

        normalized = {"_id": str(doc.get("_id", "")), **{k: v for k, v in doc.items() if k != "_id"}}
        return JSONResponse({"player": to_admin_player_export(normalized).to_dict()})
    except Exception as e:
        print(f"[admin/player-responses] {e}")
        return JSONResponse({"error": "Failed to fetch player data"}, status_code=500)
