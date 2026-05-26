// /lib/gameStore.ts
import { getRounds } from "./roundsStore";
import type { GameSession, StoredGameSession } from "./types";
import { getSessionModel } from "@server/models/Session";

const SESSION_TTL_MS = 90 * 60 * 1000; // 90 minutes

const inMemorySessions = new Map<string, StoredGameSession>();

function stripSession(session: GameSession): StoredGameSession {
  const { rounds, ...stored } = session;
  void rounds;
  return stored;
}

function hydrateSession(session: StoredGameSession): GameSession {
  return {
    ...session,
    rounds: getRounds(session.sessionId),
  };
}

// ── Email → SessionId binding (used by start-game for resume) ──────────────

export async function getBoundSessionIdForEmail(email: string): Promise<string | null> {
  try {
    const model = await getSessionModel();
    if (!model) return null;
    const doc = await model.findOne({ email }).select("sessionId").lean();
    return (doc as { sessionId?: string } | null)?.sessionId ?? null;
  } catch {
    return null;
  }
}

export async function bindEmailToSessionId(email: string, sessionId: string): Promise<void> {
  try {
    const model = await getSessionModel();
    if (!model) return;
    await model.updateOne({ sessionId }, { $set: { email } });
  } catch {
    /* non-fatal */
  }
}

export async function clearEmailSessionBinding(email: string | undefined): Promise<void> {
  if (!email) return;
  try {
    const model = await getSessionModel();
    if (!model) return;
    await model.updateOne({ email }, { $unset: { email: "" } });
  } catch {
    /* non-fatal */
  }
}

// ── Session CRUD ───────────────────────────────────────────────────────────

export async function createSession(id: string, data: GameSession): Promise<void> {
  const stored = stripSession(data);
  try {
    const model = await getSessionModel();
    if (!model) {
      inMemorySessions.set(id, stored);
      return;
    }
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await model.updateOne(
      { sessionId: id },
      { $set: { data: stored, expiresAt } },
      { upsert: true }
    );
  } catch {
    inMemorySessions.set(id, stored);
  }
}

export async function getSession(id: string): Promise<GameSession | null> {
  try {
    const model = await getSessionModel();
    if (!model) {
      const stored = inMemorySessions.get(id);
      return stored ? hydrateSession(stored) : null;
    }
    const doc = await model.findOne({ sessionId: id }).lean();
    if (!doc) return null;
    return hydrateSession((doc as { data: StoredGameSession }).data);
  } catch {
    return null;
  }
}

export async function updateSession(id: string, data: GameSession): Promise<void> {
  const stored = stripSession(data);
  try {
    const model = await getSessionModel();
    if (!model) {
      inMemorySessions.set(id, stored);
      return;
    }
    await model.updateOne({ sessionId: id }, { $set: { data: stored } });
  } catch {
    /* non-fatal */
  }
}

export async function deleteSession(id: string): Promise<void> {
  try {
    const model = await getSessionModel();
    if (!model) {
      inMemorySessions.delete(id);
      return;
    }
    await model.deleteOne({ sessionId: id });
  } catch {
    /* non-fatal */
  }
}

export function clearSessions(): void {
  inMemorySessions.clear();
}
