// /lib/gameStore.ts
import type { GameSession } from "./types";
import {
  getSessionFromRedis,
  setSessionInRedis,
  deleteSessionFromRedis,
} from "./redis";

export async function createSession(id: string, data: GameSession): Promise<void> {
  await setSessionInRedis(id, data, false);
}

export async function getSession(id: string): Promise<GameSession | null> {
  return getSessionFromRedis(id);
}

export async function updateSession(id: string, data: GameSession): Promise<void> {
  await setSessionInRedis(id, data, true);
}

export async function deleteSession(id: string): Promise<void> {
  await deleteSessionFromRedis(id);
}

/** No-op in Redis-backed store; kept for test compatibility. */
export function clearSessions(): void {
  // sessions are in Redis — use deleteSession per ID or flush Redis manually in tests
}
