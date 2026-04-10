import { getSession, updateSession } from "@/lib/gameStore";
import { isTimeUp } from "@/lib/time";
import { generateRounds } from "@/lib/generateRounds";
import { verifyAdminToken } from "@/lib/admin";
import { savePlayer } from "@/lib/playerStore";
import { connectDB } from "@server/lib/mongodb";
import PlayerModel from "@server/models/Player";

type GlobalWithCache = typeof globalThis & { _roundsCache?: ReturnType<typeof generateRounds> };
const g = globalThis as GlobalWithCache;
const roundsCache = g._roundsCache ?? (g._roundsCache = generateRounds());

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const adminToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  // If admin token provided and valid, allow fetching arbitrary round
  if (adminToken && verifyAdminToken(adminToken)) {
    try {
      const body = (await req.json()) as Record<string, unknown>;
      const roundNumber = Number(body.roundNumber ?? NaN);
      const rounds = roundsCache;
      if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > rounds.length) {
        return Response.json({ error: "Invalid roundNumber" });
      }

      const round = rounds[roundNumber - 1];
      const maxAttemptsThisRound = ({ 4: 3, 5: 2 }[roundNumber] ?? -1);

      return Response.json({
        status: "ADMIN",
        roundNumber: round.roundNumber,
        instruction: round.instruction ?? null,
        originalPrompt: round.originalPrompt ?? null,
        input: round.input ?? null,
        challenge: round.input ?? null,
        expectedOutput: round.expectedOutput ?? null,
        roundType: round.type,
        constraints: round.constraints,
        attemptsThisRound: 0,
        maxAttemptsPerRound: 3,
        maxAttemptsThisRound,
        remainingTime: Infinity,
      });
    } catch {
      return Response.json({ error: "Invalid request" });
    }
  }

  const { sessionId } = await req.json();

  const session = getSession(sessionId);

  if (!session) {
    return Response.json({ error: "Invalid session" });
  }

  if (session.status === "DISQUALIFIED") {
    return Response.json({
      status: "DISQUALIFIED",
      sessionStatus: session.status,
    });
  }

  if (session.completed && session.status === "COMPLETED") {
    return Response.json({
      status: "GAME_COMPLETED",
      sessionStatus: session.status,
      bonusUnlocked: session.bonusUnlocked,
    });
  }

  if (isTimeUp(session)) {
    session.status = "TIME_UP";
    session.completed = true;
    session.player.attemptsPerRound = { ...session.attemptsPerRound };
    session.player.timeLimit = session.timeLimit;
    session.player.gameStatus = "TIME_OVER";
    savePlayer(session.player);
    updateSession(sessionId, session);

    if (session.player.email) {
      try {
        await connectDB();
        const timeTaken = Date.now() - session.startTime;
        const totalAttempts = Object.values(session.attemptsPerRound).reduce((a, b) => a + b, 0);
        await PlayerModel.updateOne(
          { email: session.player.email },
          {
            $set: {
              roundsPlayed: session.player.roundsPlayed,
              timeTaken,
              avgAccuracy: session.player.averageScore,
              attemptsTaken: totalAttempts,
              gameStatus: "TIME_OVER",
              completedAt: new Date(),
            },
          }
        );
      } catch (e) {
        console.error("[get-round] MongoDB time-up error:", e);
      }
    }

    return Response.json({
      status: "GAME_OVER",
      reason: "TIME_UP",
    });
  }

  if (session.completed) {
    return Response.json({
      status: "GAME_OVER",
      sessionStatus: session.status,
    });
  }

  const round = session.rounds[session.currentRound - 1];
  const roundNum = session.currentRound;
  const maxAttemptsThisRound = ({ 4: 3, 5: 2 }[roundNum] ?? -1);

  return Response.json({
    status: "ACTIVE",
    roundNumber: session.currentRound,
    instruction: round.instruction ?? null,
    originalPrompt: round.originalPrompt ?? null,
    input: round.input ?? null,
    challenge: round.input ?? null,
    expectedOutput: round.expectedOutput ?? null,
    roundType: round.type,
    constraints: round.constraints,
    attemptsThisRound: session.attemptsPerRound[roundNum] ?? 0,
    maxAttemptsPerRound: session.maxAttemptsPerRound,
    maxAttemptsThisRound,
    promptParts: round.promptParts ?? null,
    remainingTime:
      (session.timeLimit - (session.penaltyTimeSec ?? 0) * 1000) - (Date.now() - session.startTime),
  });
}
