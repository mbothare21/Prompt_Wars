import { SESSION_TIME_LIMIT_MS } from "./gameConstants";
import type { Player } from "./types";

const ACCURACY_BASIS_POINTS = 10_000;
const PERFORMANCE_TIME_WINDOW_MS = 24 * 60 * 60 * 1000;

function getTotalAttempts(player: Player | Record<string, unknown>): number {
  if (!player) return 0;
  const p = player as Record<string, unknown>;
  if (typeof p.totalAttempts === "number") return p.totalAttempts as number;
  if (typeof p.attempts === "number") return p.attempts as number;
  const apr = p.attemptsPerRound;
  if (apr && typeof apr === "object") {
    return Object.values(apr as Record<string, unknown>).reduce(
      (s: number, v: unknown) => s + (Number(String(v)) || 0),
      0
    );
  }
  return 0;
}

function clampUnitInterval(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function getAccuracyTimeCompositeScore(
  averageScore: number,
  timeTakenMs: number
) {
  const accuracyUnits = Math.round(
    clampUnitInterval(averageScore) * ACCURACY_BASIS_POINTS
  );
  const safeTime = Math.max(
    0,
    Math.min(PERFORMANCE_TIME_WINDOW_MS - 1, Math.round(timeTakenMs))
  );

  // Accuracy dominates globally; time only differentiates inside the same accuracy bucket.
  return (
    accuracyUnits * PERFORMANCE_TIME_WINDOW_MS +
    (PERFORMANCE_TIME_WINDOW_MS - 1 - safeTime)
  );
}

type CompetitiveStandingInput = {
  roundsPlayed: number;
  averageScore: number;
  timeTakenMs: number;
  attempts: number;
  name: string;
};

export function compareCompetitiveStanding(
  a: CompetitiveStandingInput,
  b: CompetitiveStandingInput
) {
  if (b.roundsPlayed !== a.roundsPlayed) return b.roundsPlayed - a.roundsPlayed;

  const performanceA = getAccuracyTimeCompositeScore(
    a.averageScore,
    a.timeTakenMs
  );
  const performanceB = getAccuracyTimeCompositeScore(
    b.averageScore,
    b.timeTakenMs
  );
  if (performanceB !== performanceA) return performanceB - performanceA;

  const avgAttemptsA = a.roundsPlayed > 0 ? a.attempts / a.roundsPlayed : a.attempts;
  const avgAttemptsB = b.roundsPlayed > 0 ? b.attempts / b.roundsPlayed : b.attempts;
  if (avgAttemptsA !== avgAttemptsB) return avgAttemptsA - avgAttemptsB;

  if (a.attempts !== b.attempts) return a.attempts - b.attempts;

  return a.name.localeCompare(b.name);
}

type ProcessedPlayer = Player & {
  _totalAttempts: number;
  _timeTakenMs: number;
};

function preprocess(players: Player[]): ProcessedPlayer[] {
  return players.map((p) => {
    const totalAttempts = getTotalAttempts(p);
    const completedAt = p.completedAt ?? 0;
    const startedAt = p.startedAt ?? 0;
    const fallbackTime =
      ((p as unknown as Record<string, unknown>).timeLimit as number) ||
      SESSION_TIME_LIMIT_MS;
    const timeTakenMs =
      completedAt > 0 && startedAt > 0
        ? Math.max(0, completedAt - startedAt)
        : fallbackTime;

    return { ...p, _totalAttempts: totalAttempts, _timeTakenMs: timeTakenMs };
  });
}

export function rankPlayers(players: Player[]): Player[] {
  const processed = preprocess(players.filter((p) => p != null));

  processed.sort((a, b) => {
    return compareCompetitiveStanding(
      {
        roundsPlayed: a.roundsPlayed,
        averageScore: a.averageScore || 0,
        timeTakenMs: a._timeTakenMs,
        attempts: a._totalAttempts,
        name: a.name,
      },
      {
        roundsPlayed: b.roundsPlayed,
        averageScore: b.averageScore || 0,
        timeTakenMs: b._timeTakenMs,
        attempts: b._totalAttempts,
        name: b.name,
      }
    );
  });

  return processed;
}
