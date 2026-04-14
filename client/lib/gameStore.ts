// /lib/gameStore.ts
import { getRounds } from "./roundsStore";
import type { GameSession, StoredGameSession } from "./types";
import {
  getSessionFromRedis,
  setSessionInRedis,
  deleteSessionFromRedis,
} from "./redis";

function stripSession(session: GameSession): StoredGameSession {
  const { rounds: _rounds, ...stored } = session;
  return stored;
}

function hydrateSession(session: StoredGameSession): GameSession {
  return {
    ...session,
    rounds: getRounds(),
  };
}

export async function createSession(id: string, data: GameSession): Promise<void> {
  await setSessionInRedis(id, stripSession(data), false);
}

export async function getSession(id: string): Promise<GameSession | null> {
  const stored = await getSessionFromRedis(id);
  return stored ? hydrateSession(stored) : null;
}

export async function updateSession(id: string, data: GameSession): Promise<void> {
  await setSessionInRedis(id, stripSession(data), true);
}

export async function deleteSession(id: string): Promise<void> {
  await deleteSessionFromRedis(id);
}

/** No-op in Redis-backed store; kept for test compatibility. */
export function clearSessions(): void {
  // sessions are in Redis — use deleteSession per ID or flush Redis manually in tests
}
