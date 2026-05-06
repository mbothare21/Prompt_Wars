from fastapi import APIRouter
from fastapi.responses import JSONResponse

from PromptWars_Aetherion.lib.admin import validate_admin_credentials, create_admin_token

router = APIRouter()


@router.post("/api/admin/login")
async def admin_login(body: dict = None):
    if body is None:
        body = {}
    name = str(body.get("name") or "").strip()
    email = str(body.get("email") or "").strip()

    if not validate_admin_credentials(name, email):
        return JSONResponse({"error": "Invalid admin credentials"}, status_code=401)

    token = create_admin_token(name)
    return JSONResponse({"token": token})
