import Redis from "ioredis";
import type { StoredGameSession } from "./types";

const url = process.env.REDIS_URL?.trim();

/**
 * Redis client when `REDIS_URL` is set; otherwise `null` (all ops become no-ops).
 * Uses lazy connect so builds/tests run without a server until first command.
 */
export const redis: Redis | null =
  url && url.length > 0
    ? new Redis(url, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      })
    : null;

// ── Email → SessionId binding ─────────────────────────────────────────────────

const playerKey = (email: string) => `player:${email}`;
const BINDING_TTL_SEC = 12 * 60 * 60; // 12 hours

export async function getBoundSessionIdForEmail(
  email: string
): Promise<string | null> {
  if (!redis) return null;
  const v = await redis.get(playerKey(email));
  return v ?? null;
}

export async function bindEmailToSessionId(
  email: string,
  sessionId: string
): Promise<void> {
  if (!redis) return;
  await redis.set(playerKey(email), sessionId, "EX", BINDING_TTL_SEC);
}

export async function clearEmailSessionBinding(
  email: string | undefined
): Promise<void> {
  if (!email || !redis) return;
  try {
    await redis.del(playerKey(email));
  } catch {
    /* non-fatal */
  }
}

// ── Session storage ───────────────────────────────────────────────────────────

const sessionKey = (id: string) => `session:${id}`;
const SESSION_TTL_SEC = 75 * 60; // 75 min — game limit (10 min) + generous buffer

export async function getSessionFromRedis(
  id: string
): Promise<StoredGameSession | null> {
  if (!redis) return null;
  try {
    const raw = await redis.get(sessionKey(id));
    return raw ? (JSON.parse(raw) as StoredGameSession) : null;
  } catch {
    return null;
  }
}

export async function setSessionInRedis(
  id: string,
  data: StoredGameSession,
  keepTTL = false
): Promise<void> {
  if (!redis) return;
  try {
    if (keepTTL) {
      await redis.set(sessionKey(id), JSON.stringify(data), "KEEPTTL");
    } else {
      await redis.set(sessionKey(id), JSON.stringify(data), "EX", SESSION_TTL_SEC);
    }
  } catch {
    /* non-fatal */
  }
}

export async function deleteSessionFromRedis(id: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(sessionKey(id));
  } catch {
    /* non-fatal */
  }
}
