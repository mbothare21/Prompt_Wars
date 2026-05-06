from PromptWars_Aetherion.lib.types import Player
from PromptWars_Aetherion.lib.game_constants import SESSION_TIME_LIMIT_MS

ACCURACY_BASIS_POINTS = 10_000
PERFORMANCE_TIME_WINDOW_MS = 24 * 60 * 60 * 1000


def _get_total_attempts(player: Player) -> int:
    if player.totalAttempts is not None:
        return player.totalAttempts
    if player.attempts is not None:
        return player.attempts
    if player.attemptsPerRound:
        return sum(int(v) for v in player.attemptsPerRound.values())
    return 0


def _clamp(value: float) -> float:
    if not (value == value):  # NaN check
        return 0.0
    return min(1.0, max(0.0, value))


def get_accuracy_time_composite_score(average_score: float, time_taken_ms: int) -> int:
    accuracy_units = round(_clamp(average_score) * ACCURACY_BASIS_POINTS)
    safe_time = max(0, min(PERFORMANCE_TIME_WINDOW_MS - 1, round(time_taken_ms)))
    return accuracy_units * PERFORMANCE_TIME_WINDOW_MS + (PERFORMANCE_TIME_WINDOW_MS - 1 - safe_time)


def compare_competitive_standing(
    a_rounds: int, a_avg: float, a_time_ms: int, a_attempts: int, a_name: str,
    b_rounds: int, b_avg: float, b_time_ms: int, b_attempts: int, b_name: str,
) -> int:
    if b_rounds != a_rounds:
        return b_rounds - a_rounds

    perf_a = get_accuracy_time_composite_score(a_avg, a_time_ms)
    perf_b = get_accuracy_time_composite_score(b_avg, b_time_ms)
    if perf_b != perf_a:
        return perf_b - perf_a

    avg_att_a = a_attempts / a_rounds if a_rounds > 0 else a_attempts
    avg_att_b = b_attempts / b_rounds if b_rounds > 0 else b_attempts
    if avg_att_a != avg_att_b:
        return (1 if avg_att_a > avg_att_b else -1)

    if a_attempts != b_attempts:
        return a_attempts - b_attempts

    return (a_name > b_name) - (a_name < b_name)


def rank_players(players: list[Player]) -> list[Player]:
    def _time(p: Player) -> int:
        if p.completedAt and p.startedAt and p.completedAt > 0 and p.startedAt > 0:
            return max(0, p.completedAt - p.startedAt)
        # Fallback to timeLimit if set
        tl = getattr(p, "timeLimit", None) or SESSION_TIME_LIMIT_MS
        return tl

    valid = [p for p in players if p is not None]

    def sort_key(p: Player):
        t = _time(p)
        att = _get_total_attempts(p)
        score = get_accuracy_time_composite_score(p.averageScore or 0.0, t)
        return (-p.roundsPlayed, -score, att, p.name)

    return sorted(valid, key=sort_key)
