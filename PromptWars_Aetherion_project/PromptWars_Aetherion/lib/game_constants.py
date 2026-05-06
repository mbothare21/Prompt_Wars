MAIN_ROUNDS = 5
TOTAL_ROUNDS = 6
PASS_ADVANCE_MS = 2500
SESSION_POLL_INTERVAL_MS = 15000
SESSION_TIME_LIMIT_MS = 20 * 60 * 1000  # 20 minutes in ms

PASS_THRESHOLDS: dict[int, float] = {
    1: 1.0,
    2: 0.7,
    3: 0.65,
    4: 0.6,
    5: 0.6,
    6: 0.6,
}

ATTEMPT_LIMITS: dict[int, int] = {
    4: 3,
    5: 2,
    6: 1,
}


def get_target_score(round_num: int) -> float:
    return (PASS_THRESHOLDS.get(round_num, 0.6)) * 100
