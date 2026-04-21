// /lib/gameStore.ts
import { getRounds } from "./roundsStore";
import type { GameSession, StoredGameSession } from "./types";
import {
  getSessionFromRedis,
  setSessionInRedis,
  deleteSessionFromRedis,
  redis,
} from "./redis";

const inMemorySessions = new Map<string, StoredGameSession>();

function stripSession(session: GameSession): StoredGameSession {
  const { rounds, ...stored } = session;
  void rounds;
  return stored;
}

function hydrateSession(session: StoredGameSession): GameSession {
  return {
    ...session,
    rounds: getRounds(),
  };
}

export async function createSession(id: string, data: GameSession): Promise<void> {
  if (!redis) {
    inMemorySessions.set(id, stripSession(data));
    return;
  }
  await setSessionInRedis(id, stripSession(data), false);
}

export async function getSession(id: string): Promise<GameSession | null> {
  if (!redis) {
    const stored = inMemorySessions.get(id);
    return stored ? hydrateSession(stored) : null;
  }
  const stored = await getSessionFromRedis(id);
  return stored ? hydrateSession(stored) : null;
}

export async function updateSession(id: string, data: GameSession): Promise<void> {
  if (!redis) {
    inMemorySessions.set(id, stripSession(data));
    return;
  }
  await setSessionInRedis(id, stripSession(data), true);
}

export async function deleteSession(id: string): Promise<void> {
  if (!redis) {
    inMemorySessions.delete(id);
    return;
  }
  await deleteSessionFromRedis(id);
}

export function clearSessions(): void {
  inMemorySessions.clear();
}
