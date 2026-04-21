import { getSession, updateSession } from "@/lib/gameStore";
import { isTimeUp } from "@/lib/time";
import { verifyAdminToken } from "@/lib/admin";
import { savePlayer } from "@/lib/playerStore";
import { ATTEMPT_LIMITS } from "@/lib/gameConstants";
import { getRounds } from "@/lib/roundsStore";
import { persistTerminalSession } from "@server/lib/playerPersistence";

export const runtime = "nodejs";

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
      const rounds = getRounds();
      if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > rounds.length) {
        return Response.json({ error: "Invalid roundNumber" });
      }

      const round = rounds[roundNumber - 1];
      const maxAttemptsThisRound = ATTEMPT_LIMITS[roundNumber] ?? -1;

      return Response.json({
        status: "ADMIN",
        roundNumber: round.roundNumber,
        instruction: round.instruction ?? null,
        originalPrompt: round.originalPrompt ?? null,
        input: round.input ?? null,
        challenge: round.input ?? null,
        expectedOutput: round.expectedOutput ?? null,
        roundType: round.type,
        constraints: round.type === "BONUS" ? null : round.constraints,
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

  const session = await getSession(sessionId);

  if (!session) {
    return Response.json({ error: "Invalid session" });
  }

  if (session.status === "DISQUALIFIED") {
    return Response.json({
      status: "DISQUALIFIED",
      sessionStatus: session.status,
    });
  }

  if (session.status === "FAILED") {
    return Response.json({
      status: "GAME_OVER",
      sessionStatus: session.status,
      reason: "ATTEMPTS_EXHAUSTED",
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
    session.player.completed = true;
    session.player.completedAt = Date.now();
    session.player.attemptsPerRound = { ...session.attemptsPerRound };
    session.player.timeLimit = session.timeLimit;
    session.player.gameStatus = "TIME_OVER";
    savePlayer(session.player);
    await updateSession(sessionId, session);

    await persistTerminalSession(session, "TIME_OVER").catch((e) =>
      console.error("[get-round] MongoDB time-up error:", e)
    );

    return Response.json({
      status: "GAME_OVER",
      reason: "TIME_UP",
    });
  }

  if (session.completed) {
    return Response.json({
      status: "GAME_OVER",
      sessionStatus: session.status,
      reason: session.status === "TIME_UP" ? "TIME_UP" : undefined,
    });
  }

  const round = session.rounds[session.currentRound - 1];
  const roundNum = session.currentRound;
  const maxAttemptsThisRound = ATTEMPT_LIMITS[roundNum] ?? -1;

  if (round.type === "BONUS" && !session.bonusUnlocked) {
    session.bonusUnlocked = true;
    await updateSession(sessionId, session);
  }

  return Response.json({
    status: "ACTIVE",
    roundNumber: session.currentRound,
    instruction: round.instruction ?? null,
    originalPrompt: round.originalPrompt ?? null,
    input: round.input ?? null,
    challenge: round.input ?? null,
    expectedOutput: round.expectedOutput ?? null,
    roundType: round.type,
    constraints: round.type === "BONUS" ? null : round.constraints,
    attemptsThisRound: session.attemptsPerRound[roundNum] ?? 0,
    maxAttemptsPerRound: session.maxAttemptsPerRound,
    maxAttemptsThisRound,
    promptParts: round.promptParts ?? null,
    remainingTime:
      (session.timeLimit - (session.penaltyTimeSec ?? 0) * 1000) - (Date.now() - session.startTime),
  });
}
