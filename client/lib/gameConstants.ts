export const MAIN_ROUNDS = 5;
export const TOTAL_ROUNDS = 6;
export const PASS_ADVANCE_MS = 2500;
export const SESSION_POLL_INTERVAL_MS = 15000;
export const SESSION_TIME_LIMIT_MS = 20 * 60 * 1000;

export const PASS_THRESHOLDS: Record<number, number> = {
  1: 1.0,
  2: 0.7,
  3: 0.65,
  4: 0.6,
  5: 0.6,
  6: 0.6,
};

export const ATTEMPT_LIMITS: Record<number, number> = {
  4: 3,
  5: 2,
  6: 1,
};

export function getTargetScore(round: number): number {
  return (PASS_THRESHOLDS[round] ?? 0.6) * 100;
}
