import { v4 as uuidv4 } from "uuid";
import { createSession, getSession, updateSession } from "@/lib/gameStore";
import { getRounds } from "@/lib/roundsStore";
import { SESSION_TIME_LIMIT_MS } from "@/lib/gameConstants";
import {
  bindEmailToSessionId,
  getBoundSessionIdForEmail,
} from "@/lib/redis";
import { isTimeUp } from "@/lib/time";
import type { GameSession } from "@/lib/types";
import {
  ensurePlayerRecord,
  findAnyPlayerAttemptByEmail,
  findCompletedPlayerByEmail,
  persistTerminalSession,
} from "@server/lib/playerPersistence";
import { validateEmployeeIdentity } from "@server/lib/employeeAccess";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let name = "Guest";
  let email: string | undefined;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.name === "string" && body.name.trim()) {
      name = body.name.trim();
    }
    if (typeof body.email === "string" && body.email.trim()) {
      email = body.email.trim();
    }
  } catch {
    /* empty or invalid body */
  }

  const identityCheck = await validateEmployeeIdentity(name, email);
  if (!identityCheck.ok) {
    return Response.json(
      { error: identityCheck.error ?? "Identity verification failed." },
      { status: 403 }
    );
  }
  if (identityCheck.isAdmin) {
    return Response.json(
      {
        error:
          "Admin credentials are reserved for the admin preview terminal and cannot start a player session.",
      },
      { status: 403 }
    );
  }

  if (email) {
    try {
      const existingSessionId = await getBoundSessionIdForEmail(email);
      if (existingSessionId) {
        const existing = await getSession(existingSessionId);

        if (existing?.completed) {
          return Response.json({
            status: "ALREADY_PLAYED",
            message: "You have already completed the game.",
          });
        }

        if (existing && !existing.completed && isTimeUp(existing)) {
          existing.status = "TIME_UP";
          existing.completed = true;
          existing.player.completed = true;
          existing.player.completedAt = Date.now();
          existing.player.attemptsPerRound = { ...existing.attemptsPerRound };
          existing.player.timeLimit = existing.timeLimit;
          existing.player.gameStatus = "TIME_OVER";
          await updateSession(existingSessionId, existing);
          await persistTerminalSession(existing, "TIME_OVER").catch((e: unknown) =>
            console.error("[start-game] MongoDB expired-session error:", e)
          );

          return Response.json({
            status: "ALREADY_PLAYED",
            message: "Your previous session has already expired.",
          });
        }

        if (
          existing &&
          !existing.completed &&
          existing.status === "ACTIVE" &&
          !isTimeUp(existing)
        ) {
          const remainingTime = Math.max(
            0,
            existing.timeLimit - (Date.now() - existing.startTime)
          );
          return Response.json({
            status: "RESUME",
            sessionId: existingSessionId,
            startTime: existing.startTime,
            timeLimit: existing.timeLimit,
            remainingTime,
          });
        }
      }
    } catch (e) {
      console.error("[start-game] Redis resume error:", e);
    }

    try {
      const alreadyCompleted = await findCompletedPlayerByEmail(email);
      if (alreadyCompleted) {
        return Response.json({
          status: "ALREADY_PLAYED",
          message: "You have already completed the game.",
        });
      }

      const alreadyStarted = await findAnyPlayerAttemptByEmail(email);
      if (alreadyStarted) {
        return Response.json({
          status: "ALREADY_PLAYED",
          message:
            "An attempt for this email is already on record. Resume the existing run while it is still active; otherwise contact an admin.",
        });
      }
    } catch (e) {
      console.error("[start-game] MongoDB already-played check error:", e);
    }
  }

  const sessionId = uuidv4();

  const session: GameSession = {
    sessionId,

    player: {
      playerId: uuidv4(),
      name,
      ...(email !== undefined ? { email } : {}),
      startedAt: Date.now(),
      roundsPlayed: 0,
      totalScore: 0,
      averageScore: 0,
      completed: false,
    },

    currentRound: 1,
    rounds: getRounds(),

    startTime: Date.now(),
    timeLimit: SESSION_TIME_LIMIT_MS,

    completed: false,
    status: "ACTIVE",

    attemptsPerRound: {},
    maxAttemptsPerRound: 3,

    scores: [],
    bonusUnlocked: false,

    violations: 0,
    penaltyTimeSec: 0,
  };

  await createSession(sessionId, session);

  if (email) {
    await bindEmailToSessionId(email, sessionId).catch((e) =>
      console.error("[start-game] Redis bind error:", e)
    );
    await ensurePlayerRecord(session).catch((e) =>
      console.error("[start-game] MongoDB create player error:", e)
    );
  }

  return Response.json({
    status: "NEW_GAME",
    sessionId,
    startTime: session.startTime,
    timeLimit: session.timeLimit,
    remainingTime: session.timeLimit,
  });
}
