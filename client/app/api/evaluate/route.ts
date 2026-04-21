import { getSession, updateSession } from "@/lib/gameStore";
import { ATTEMPT_LIMITS, PASS_THRESHOLDS } from "@/lib/gameConstants";
import { isTimeUp } from "@/lib/time";
import { evaluateRound, evaluateMetaBonusRound } from "@/lib/evaluator";
import { savePlayer } from "@/lib/playerStore";
import { persistTerminalSession } from "@server/lib/playerPersistence";

export const runtime = "nodejs";

const BONUS_SCORE_THRESHOLD = 0.92;

function withTimeout<T>(promise: Promise<T>, ms = 3000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Evaluator timeout")), ms)
    ),
  ]);
}

export async function POST(req: Request) {
  const { sessionId, prompt, answers, metaPrompt, finalPrompt } = await req.json() as {
    sessionId: string;
    prompt?: string;
    answers?: Record<string, string>;
    metaPrompt?: string;
    finalPrompt?: string;
  };

  const session = await getSession(sessionId);

  if (!session) {
    return Response.json({ error: "Invalid session" });
  }

  if (session.completed || session.status === "DISQUALIFIED") {
    return Response.json({
      status: "GAME_ALREADY_COMPLETED",
      sessionStatus: session.status,
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

    void persistTerminalSession(session, "TIME_OVER").catch((e) =>
      console.error("[evaluate] MongoDB time-up error:", e)
    );

    return Response.json({ status: "GAME_OVER", reason: "TIME_UP" });
  }

  const effectiveLimit = session.timeLimit - (session.penaltyTimeSec ?? 0) * 1000;
  const timeLeft = effectiveLimit - (Date.now() - session.startTime);

  if (session.currentRound > 5 && timeLeft > 0 && !session.bonusUnlocked) {
    session.bonusUnlocked = true;
    await updateSession(sessionId, session);
    return Response.json({ status: "BONUS_AVAILABLE", remainingTime: timeLeft });
  }

  const roundNum = session.currentRound;
  const round = session.rounds[roundNum - 1];
  const totalRounds = session.rounds.length;

  if (round.type === "CLASSIFY") {
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return Response.json({ error: "Invalid answers" });
    }
  } else {
    if (typeof prompt !== "string" || prompt.trim().length < 3) {
      return Response.json({ error: "Invalid prompt" });
    }
  }

  if (round.type === "BONUS") {
    if (!metaPrompt || !finalPrompt) {
      return Response.json({ status: "INVALID_SUBMISSION", message: "Both inputs are required" });
    }
    if (session.bonusAttempted) {
      return Response.json({ error: "Already attempted" });
    }
    session.bonusAttempted = true;
  }

  session.attemptsPerRound[roundNum] = (session.attemptsPerRound[roundNum] || 0) + 1;

  const maxAttempts = ATTEMPT_LIMITS[roundNum] ?? Infinity;

  if (Number.isFinite(maxAttempts) && session.attemptsPerRound[roundNum] > maxAttempts) {
    session.status = "DISQUALIFIED";
    session.completed = true;
    session.player.completed = true;
    session.player.completedAt = Date.now();
    session.player.attemptsPerRound = { ...session.attemptsPerRound };
    session.player.timeLimit = session.timeLimit;
    session.player.gameStatus = "FAILED";
    savePlayer(session.player);
    await updateSession(sessionId, session);

    void persistTerminalSession(session, "FAILED").catch((e) =>
      console.error("[evaluate] MongoDB attempts-exhausted error:", e)
    );

    return Response.json({
      status: "NO_ATTEMPTS_LEFT",
      round: roundNum,
      attempts: session.attemptsPerRound[roundNum],
    });
  }

  const result = round.type === "BONUS"
    ? await withTimeout(
        evaluateMetaBonusRound({
          metaPrompt: metaPrompt ?? "",
          finalPrompt: finalPrompt ?? "",
          basePrompt: round.input ?? "",
          targetOutput: round.targetOutput ?? round.expectedOutput ?? "",
        }),
        3000
      )
    : await withTimeout(
        evaluateRound(round, prompt ?? "", answers),
        3000
      );

  let finalScore = result.finalScore;
  let progress = result.progress;
  if (round.type === "BONUS") {
    finalScore *= 1.5;
    progress = Math.round(finalScore * 100);
  }

  session.player.roundsPlayed += 1;
  session.player.totalScore += finalScore;
  session.scores.push(finalScore);
  session.player.averageScore = session.player.totalScore / session.scores.length;

  // Accumulate round data in session — flushed to DB at terminal states
  session.pendingRounds = [
    ...(session.pendingRounds ?? []),
    {
      round: roundNum,
      attempts: session.attemptsPerRound[roundNum],
      score: finalScore,
      prompt: round.type === "CLASSIFY"
        ? answers
        : round.type === "BONUS"
          ? { metaPrompt, finalPrompt }
          : prompt,
      output: ("output" in result ? result.output : undefined)
        ?? ("finalOutput" in result ? result.finalOutput : undefined)
        ?? "",
    },
  ];

  const passThreshold = PASS_THRESHOLDS[roundNum] ?? 0.60;

  if (finalScore >= passThreshold) {
    session.currentRound++;

    if (session.currentRound > totalRounds) {
      session.completed = true;
      session.status = "COMPLETED";
      session.player.completed = true;
      session.player.completedAt = Date.now();
      const highScoreBonus = finalScore >= BONUS_SCORE_THRESHOLD;
      session.player.attemptsPerRound = { ...session.attemptsPerRound };
      session.player.timeLimit = session.timeLimit;
      const completedStatus = session.player.roundsPlayed >= 6
        ? "COMPLETED_WITH_BONUS" as const
        : "COMPLETED" as const;
      session.player.gameStatus = completedStatus;
      savePlayer(session.player);
      await updateSession(sessionId, session);

      void persistTerminalSession(session, completedStatus).catch((e) =>
        console.error("[evaluate] MongoDB completion error:", e)
      );

      return Response.json({
        status: "GAME_COMPLETED",
        bonusUnlocked: session.bonusUnlocked,
        highScoreBonus,
        ...result,
        finalScore,
        progress,
      });
    }

    await updateSession(sessionId, session);
    return Response.json({
      status: "ROUND_PASSED",
      nextRound: session.currentRound,
      attemptsThisRound: session.attemptsPerRound[roundNum],
      ...result,
      finalScore,
      progress,
    });
  }

  updateSession(sessionId, session);
  return Response.json({
    status: "ROUND_FAILED",
    attemptsThisRound: session.attemptsPerRound[roundNum],
    attemptsRemaining: Number.isFinite(maxAttempts)
      ? Math.max(0, maxAttempts - session.attemptsPerRound[roundNum])
      : -1,
    maxAttemptsThisRound: Number.isFinite(maxAttempts) ? maxAttempts : -1,
    ...result,
    finalScore,
    progress,
  });
}
