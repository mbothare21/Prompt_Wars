// /lib/gameStore.ts
import type { GameSession } from "./types";

const sessions = new Map<string, GameSession>();

export const createSession = (id: string, data: GameSession) => {
  sessions.set(id, data);
};

export const getSession = (id: string) => {
  return sessions.get(id);
};

export const updateSession = (id: string, data: GameSession) => {
  sessions.set(id, data);
};

/** Clears in-memory sessions (for tests). */
export function clearSessions() {
  sessions.clear();
}
