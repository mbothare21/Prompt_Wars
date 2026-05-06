import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Load environment variables
load_dotenv()
load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv(Path(__file__).parent.parent / ".env.local")

from PromptWars_Aetherion.routers.start_game import router as start_game_router
from PromptWars_Aetherion.routers.get_round import router as get_round_router
from PromptWars_Aetherion.routers.evaluate import router as evaluate_router
from PromptWars_Aetherion.routers.penalty import router as penalty_router
from PromptWars_Aetherion.routers.leaderboard import router as leaderboard_router
from PromptWars_Aetherion.routers.compile_meta_prompt import router as compile_meta_prompt_router
from PromptWars_Aetherion.routers.admin.login import router as admin_login_router
from PromptWars_Aetherion.routers.admin.leaderboard import router as admin_leaderboard_router
from PromptWars_Aetherion.routers.admin.player_responses import router as admin_player_responses_router
from PromptWars_Aetherion.routers.admin.export_leaderboard import router as admin_export_leaderboard_router

app = FastAPI(title="Prompt Wars - Aetherion", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
app.include_router(start_game_router)
app.include_router(get_round_router)
app.include_router(evaluate_router)
app.include_router(penalty_router)
app.include_router(leaderboard_router)
app.include_router(compile_meta_prompt_router)
app.include_router(admin_login_router)
app.include_router(admin_leaderboard_router)
app.include_router(admin_player_responses_router)
app.include_router(admin_export_leaderboard_router)

# Serve static files (frontend)
STATIC_DIR = Path(__file__).parent.parent / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
async def root():
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return {"message": "Prompt Wars API is running. Frontend not found."}


@app.get("/health")
async def health():
    return {"status": "ok"}


def run():
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("PromptWars_Aetherion.main:app", host="0.0.0.0", port=port, reload=True)


if __name__ == "__main__":
    run()
