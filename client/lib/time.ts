// /lib/time.ts
import type { GameSession } from "./types";

export function isTimeUp(session: GameSession) {
  const effectiveLimit = session.timeLimit - (session.penaltyTimeSec ?? 0) * 1000;
  return Date.now() - session.startTime > effectiveLimit;
}
