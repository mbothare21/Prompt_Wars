import type { Player } from "./types";

const DEFAULT_MAX_TIME = 10 * 60 * 1000;

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

type ProcessedPlayer = Player & {
  _totalAttempts: number;
  _combinedScore: number;
};

function preprocess(players: Player[]): ProcessedPlayer[] {
  return players.map((p) => {
    const totalAttempts = getTotalAttempts(p);
    const time = (p.completedAt || 0) - (p.startedAt || 0);
    const maxTime = ((p as unknown as Record<string, unknown>).timeLimit as number) || DEFAULT_MAX_TIME;
    const normalizedTime = maxTime > 0 ? time / maxTime : 0;
    const combinedScore = normalizedTime - (p.averageScore || 0);
    return { ...p, _totalAttempts: totalAttempts, _combinedScore: combinedScore };
  });
}

export function rankPlayers(players: Player[]): Player[] {
  const processed = preprocess(players.filter((p) => p != null));

  processed.sort((a, b) => {
    if (b.roundsPlayed !== a.roundsPlayed) return b.roundsPlayed - a.roundsPlayed;

    if (a._combinedScore !== b._combinedScore) return a._combinedScore - b._combinedScore;

    const avgA = a.roundsPlayed > 0 ? a._totalAttempts / a.roundsPlayed : 0;
    const avgB = b.roundsPlayed > 0 ? b._totalAttempts / b.roundsPlayed : 0;
    if (avgA !== avgB) return avgA - avgB;

    return (b.averageScore || 0) - (a.averageScore || 0);
  });

  return processed;
}
