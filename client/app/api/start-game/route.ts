import { v4 as uuidv4 } from "uuid";
import { createSession, getSession } from "@/lib/gameStore";
import { generateRounds } from "@/lib/generateRounds";
import {
  bindEmailToSessionId,
  clearEmailSessionBinding,
  getBoundSessionIdForEmail,
} from "@/lib/redis";
import { isTimeUp } from "@/lib/time";
import type { GameSession } from "@/lib/types";
import { connectDB } from "@server/lib/mongodb";
import Player from "@server/models/Player";

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

  if (email) {
    try {
      const existingSessionId = await getBoundSessionIdForEmail(email);
      if (existingSessionId) {
        const existing = getSession(existingSessionId);

        if (existing?.completed) {
          return Response.json({
            status: "ALREADY_PLAYED",
            message: "You have already completed the game.",
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

        await clearEmailSessionBinding(email);
      }
    } catch (e) {
      console.error("[start-game] Redis resume error:", e);
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
    rounds: generateRounds(),

    startTime: Date.now(),
    timeLimit: 10 * 60 * 1000,

    completed: false,
    status: "ACTIVE",

    attemptsPerRound: {},
    maxAttemptsPerRound: 3,

    scores: [],
    bonusUnlocked: false,

    violations: 0,
    penaltyTimeSec: 0,
  };

  createSession(sessionId, session);

  if (email) {
    try {
      await bindEmailToSessionId(email, sessionId);
    } catch (e) {
      console.error("[start-game] Redis bind error:", e);
    }
  }

  // Persist player to MongoDB
  if (email) {
    try {
      await connectDB();
      await Player.updateOne(
        { email },
        {
          $setOnInsert: {
            name,
            email,
            roundsPlayed: 0,
            timeTaken: 0,
            avgAccuracy: 0,
            attemptsTaken: 0,
            gameStatus: "COMPLETED",
            rounds: [],
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
    } catch (e) {
      console.error("[start-game] MongoDB error:", e);
    }
  }

  return Response.json({
    status: "NEW_GAME",
    sessionId,
    startTime: session.startTime,
    timeLimit: session.timeLimit,
    remainingTime: session.timeLimit,
  });
}
