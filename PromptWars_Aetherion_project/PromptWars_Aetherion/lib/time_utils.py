import time
from PromptWars_Aetherion.lib.types import GameSession


def now_ms() -> int:
    return int(time.time() * 1000)


def is_time_up(session: GameSession) -> bool:
    effective_limit = session.timeLimit - (session.penaltyTimeSec or 0) * 1000
    return now_ms() - session.startTime > effective_limit
