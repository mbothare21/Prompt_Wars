import Redis from "ioredis";

const url = process.env.REDIS_URL?.trim();

/**
 * Redis client when `REDIS_URL` is set; otherwise `null` (resume/bind skipped).
 * Uses lazy connect so builds/tests run without a server until first command.
 */
export const redis: Redis | null =
  url && url.length > 0
    ? new Redis(url, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      })
    : null;

const playerKey = (email: string) => `player:${email}`;

/** Keep email→session mapping bounded (hours). */
const BINDING_TTL_SEC = 12 * 60 * 60;

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
