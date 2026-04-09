import type { Player } from "./types";

const DEFAULT_MAX_TIME = 10 * 60 * 1000; // 10 minutes in ms

function getTotalAttempts(player: Player | Record<string, unknown>): number {
  // Support several possible shapes for stored attempts
  if (!player) return 0;
  const p = player as Record<string, unknown>;
  if (typeof p.totalAttempts === "number") return p.totalAttempts as number;
  if (typeof p.attempts === "number") return p.attempts as number;
  const apr = p.attemptsPerRound;
  if (apr && typeof apr === "object") {
  return Object.values(apr as Record<string, unknown>).reduce((s: number, v: unknown) => s + (Number(String(v)) || 0), 0);
  }
  return 0;
}

export function rankPlayers(players: Player[]): Player[] {
  return [...players]
    .filter((p) => p != null)
  .sort((a: Player, b: Player) => {
      // 1) Rounds completed (desc)
      if (b.roundsPlayed !== a.roundsPlayed) {
        return b.roundsPlayed - a.roundsPlayed;
      }

      // 2) Combined score (lower is better)
  const timeA = (a.completedAt || 0) - (a.startedAt || 0);
  const timeB = (b.completedAt || 0) - (b.startedAt || 0);

  const ap = a as unknown as Record<string, unknown>;
  const bp = b as unknown as Record<string, unknown>;

  const maxA = typeof ap.timeLimit === "number" ? (ap.timeLimit as number) : DEFAULT_MAX_TIME;
  const maxB = typeof bp.timeLimit === "number" ? (bp.timeLimit as number) : DEFAULT_MAX_TIME;

  const normalizedTimeA = maxA > 0 ? timeA / maxA : 0;
  const normalizedTimeB = maxB > 0 ? timeB / maxB : 0;

  const combinedA = normalizedTimeA - (a.averageScore || 0);
  const combinedB = normalizedTimeB - (b.averageScore || 0);

      if (combinedA !== combinedB) return combinedA - combinedB;

      // 3) Average attempts per round (asc — fewer is better)
      const avgAttemptsA = a.roundsPlayed > 0 ? getTotalAttempts(a) / a.roundsPlayed : 0;
      const avgAttemptsB = b.roundsPlayed > 0 ? getTotalAttempts(b) / b.roundsPlayed : 0;
      if (avgAttemptsA !== avgAttemptsB) return avgAttemptsA - avgAttemptsB;

      // fallback: higher average score wins
      if ((b.averageScore || 0) !== (a.averageScore || 0)) {
        return (b.averageScore || 0) - (a.averageScore || 0);
      }

      return 0;
    });
}
