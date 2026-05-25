import { getSession, updateSession } from "@/lib/gameStore";
import { ATTEMPT_LIMITS, MAIN_ROUNDS, PASS_THRESHOLDS } from "@/lib/gameConstants";
import { isTimeUp } from "@/lib/time";
import { evaluateRound, evaluateMetaBonusRound } from "@/lib/evaluator";
import { savePlayer } from "@/lib/playerStore";
import {
  persistProgressSnapshot,
  persistTerminalSession,
} from "@server/lib/playerPersistence";

export const runtime = "nodejs";

const BONUS_SCORE_THRESHOLD = 0.92;
const EVALUATOR_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.EVALUATOR_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
})();

function withTimeout<T>(promise: Promise<T>, ms = EVALUATOR_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Evaluator timeout")), ms)
    ),
  ]);
}

function isTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout/i.test(message);
}

type PendingRoundRecord = {
  round: number;
  attempts: number;
  score: number;
  prompt: unknown;
  output: string;
};

function derivePlayerMetrics(rounds: PendingRoundRecord[] | undefined) {
  const bestScoreByRound = new Map<number, number>();

  for (const round of rounds ?? []) {
    const currentBest = bestScoreByRound.get(round.round) ?? 0;
    bestScoreByRound.set(round.round, Math.max(currentBest, round.score));
  }

  const roundsPlayed = bestScoreByRound.size;
  const roundsPassed = Array.from(bestScoreByRound.values()).filter((score) => score > 0).length;
  const totalScore = Array.from(bestScoreByRound.values()).reduce(
    (sum, score) => sum + score,
    0
  );
  const averageScore = roundsPlayed > 0 ? totalScore / roundsPlayed : 0;

  return {
    roundsPlayed,
    roundsPassed,
    totalScore,
    averageScore,
  };
}

export async function POST(req: Request) {
  const { sessionId, prompt, answers, metaPrompt } = await req.json() as {
    sessionId: string;
    prompt?: string;
    answers?: Record<string, string>;
    metaPrompt?: string;
  };

  const session = await getSession(sessionId);

  if (!session) {
    return Response.json({ error: "Invalid session" });
  }

  if (session.completed || session.status === "DISQUALIFIED") {
    console.log("[evaluate] GAME_ALREADY_COMPLETED", {
      sessionId,
      status: session.status,
      completed: session.completed,
      currentRound: session.currentRound,
      player: session.player.email ?? session.player.name,
    });
    return Response.json({
      status: "GAME_ALREADY_COMPLETED",
      sessionStatus: session.status,
    });
  }

  if (isTimeUp(session)) {
    console.log("[evaluate] GAME_OVER:TIME_UP", {
      sessionId,
      player: session.player.email ?? session.player.name,
      currentRound: session.currentRound,
      elapsedMs: Date.now() - session.startTime,
      timeLimitMs: session.timeLimit,
    });
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
      console.error("[evaluate] MongoDB time-up error:", e)
    );

    return Response.json({ status: "GAME_OVER", reason: "TIME_UP" });
  }

  const roundNum = session.currentRound;
  const round = session.rounds[roundNum - 1];
  const totalRounds = session.rounds.length;
  const evaluationStartedAt = Date.now();
  let evaluationPauseCommitted = false;
  const commitEvaluationPause = () => {
    if (evaluationPauseCommitted) return;
    session.startTime += Date.now() - evaluationStartedAt;
    evaluationPauseCommitted = true;
  };

  if (round.type === "CLASSIFY") {
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return Response.json({ error: "Invalid answers" });
    }
  } else if (round.type === "BONUS") {
    if (!metaPrompt) {
      return Response.json({
        status: "INVALID_SUBMISSION",
        message: "A meta-prompt is required",
      });
    }
    if (session.bonusAttempted) {
      return Response.json({ error: "Already attempted" });
    }
    session.bonusAttempted = true;
  } else {
    if (typeof prompt !== "string" || prompt.trim().length < 3) {
      return Response.json({ error: "Invalid prompt" });
    }
  }

  session.attemptsPerRound[roundNum] = (session.attemptsPerRound[roundNum] || 0) + 1;

  const maxAttempts = ATTEMPT_LIMITS[roundNum] ?? Infinity;

  if (Number.isFinite(maxAttempts) && session.attemptsPerRound[roundNum] > maxAttempts) {
    const isBonusRound = roundNum > MAIN_ROUNDS;
    console.log("[evaluate] NO_ATTEMPTS_LEFT:pre-eval", {
      sessionId,
      player: session.player.email ?? session.player.name,
      round: roundNum,
      attemptsUsed: session.attemptsPerRound[roundNum],
      maxAttempts,
      isBonusRound,
    });

    if (!isBonusRound) {
      // Force-advance: record 0 for this round and move to the next round
      session.pendingRounds = [
        ...(session.pendingRounds ?? []).filter((r) => r.round !== roundNum),
        { round: roundNum, attempts: session.attemptsPerRound[roundNum], score: 0, prompt: null, output: "" },
      ];
      session.currentRound++;
      if (session.currentRound > MAIN_ROUNDS) session.bonusUnlocked = true;
      const metrics = derivePlayerMetrics(session.pendingRounds);
      session.player.roundsPlayed = metrics.roundsPlayed;
      session.player.roundsPassed = metrics.roundsPassed;
      session.player.totalScore = metrics.totalScore;
      session.player.averageScore = metrics.averageScore;
      await updateSession(sessionId, session);
      await persistProgressSnapshot(session).catch((e) =>
        console.error("[evaluate] MongoDB force-advance snapshot error:", e)
      );
      const remaining = Math.max(0, (session.timeLimit - (session.penaltyTimeSec ?? 0) * 1000) - (Date.now() - session.startTime));
      return Response.json({
        status: "ROUND_FORCE_ADVANCED",
        nextRound: session.currentRound,
        attemptsThisRound: session.attemptsPerRound[roundNum],
        remainingTime: remaining,
        finalScore: 0,
        progress: 0,
      });
    }

    // Bonus round: end game as completed
    session.pendingRounds = [
      ...(session.pendingRounds ?? []).filter((r) => r.round !== roundNum),
      {
        round: roundNum,
        attempts: session.attemptsPerRound[roundNum],
        score: 0,
        prompt: round.type === "CLASSIFY"
          ? answers
          : round.type === "BONUS"
            ? { metaPrompt }
            : prompt,
        output: "",
      },
    ];
    const metrics = derivePlayerMetrics(session.pendingRounds);
    session.player.roundsPlayed = metrics.roundsPlayed;
    session.player.roundsPassed = metrics.roundsPassed;
    session.player.totalScore = metrics.totalScore;
    session.player.averageScore = metrics.averageScore;
    session.status = "COMPLETED";
    session.completed = true;
    session.player.completed = true;
    session.player.completedAt = Date.now();
    session.player.attemptsPerRound = { ...session.attemptsPerRound };
    session.player.timeLimit = session.timeLimit;
    session.player.gameStatus = "COMPLETED";
    savePlayer(session.player);
    await updateSession(sessionId, session);
    await persistTerminalSession(session, "COMPLETED").catch((e) =>
      console.error("[evaluate] MongoDB bonus-exhausted error:", e)
    );
    return Response.json({
      status: "NO_ATTEMPTS_LEFT",
      round: roundNum,
      attempts: session.attemptsPerRound[roundNum],
    });
  }

  let result;
  try {
    result = round.type === "BONUS"
      ? await withTimeout(
          evaluateMetaBonusRound({
            metaPrompt: metaPrompt ?? "",
            basePrompt: round.input ?? "",
            evalConfig: round.bonusEvalConfig!,
          })
        )
      : await withTimeout(
          evaluateRound(round, prompt ?? "", answers)
        );
  } catch (error) {
    commitEvaluationPause();
    const attemptsUsed = session.attemptsPerRound[roundNum] ?? 0;
    if (attemptsUsed <= 1) {
      delete session.attemptsPerRound[roundNum];
    } else {
      session.attemptsPerRound[roundNum] = attemptsUsed - 1;
    }
    if (round.type === "BONUS") {
      session.bonusAttempted = false;
    }
    await updateSession(sessionId, session);

    const timeout = isTimeoutError(error);
    console.error(
      timeout ? "[evaluate] evaluator timeout:" : "[evaluate] evaluator error:",
      error
    );

    return Response.json({
      status: timeout ? "EVALUATION_TIMEOUT" : "EVALUATION_ERROR",
      retryable: true,
      message: timeout
        ? "Evaluation took too long. Please Re-Submit."
        : "Evaluation failed. Please Re-Submit.",
    });
  }

  let finalScore = result.finalScore;
  let progress = result.progress;
  if (round.type === "BONUS") {
    finalScore = Math.min(1, finalScore * 1.5);
    progress = Math.round(finalScore * 100);
  }
  commitEvaluationPause();

  // For Round 1 (CLASSIFY), apply a 5% penalty per failed attempt to the stored score.
  // This affects reports and leaderboard averages only — the pass threshold still uses raw score.
  const failedAttemptsBefore = (session.attemptsPerRound[roundNum] ?? 1) - 1;
  const reportScore = roundNum === 1
    ? Math.max(0, finalScore - failedAttemptsBefore * 0.05)
    : finalScore;

  // Accumulate round data in session — flushed to DB at terminal states
  session.pendingRounds = [
    ...(session.pendingRounds ?? []),
    {
      round: roundNum,
      attempts: session.attemptsPerRound[roundNum],
      score: reportScore,
      prompt: round.type === "CLASSIFY"
        ? answers
        : round.type === "BONUS"
          ? {
              metaPrompt,
              compiledPrompt:
                "compiledPrompt" in result ? result.compiledPrompt : undefined,
            }
          : prompt,
      output: round.type === "CLASSIFY"
        ? (() => {
            const cr = result as { correct?: number; total?: number };
            return JSON.stringify({
              correct: cr.correct ?? 0,
              total: cr.total ?? 0,
              details: (round.promptParts ?? []).map((p) => ({
                id: p.id,
                text: p.text,
                chosen: (answers ?? {})[p.id] ?? null,
                correct: p.answer,
                isCorrect: (answers ?? {})[p.id] === p.answer,
              })),
            });
          })()
        : ("output" in result ? result.output : undefined)
            ?? ("finalOutput" in result ? result.finalOutput : undefined)
            ?? "",
    },
  ];

  const metrics = derivePlayerMetrics(session.pendingRounds);
  session.player.roundsPlayed = metrics.roundsPlayed;
  session.player.roundsPassed = metrics.roundsPassed;
  session.player.totalScore = metrics.totalScore;
  session.player.averageScore = metrics.averageScore;

  const passThreshold = PASS_THRESHOLDS[roundNum] ?? 0.60;
  // Use the raw score for progression so display rounding never grants a pass.
  if (finalScore >= passThreshold) {
    session.currentRound++;
    if (session.currentRound > 5) {
      session.bonusUnlocked = true;
    }

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

      await persistTerminalSession(session, completedStatus).catch((e) =>
        console.error("[evaluate] MongoDB completion error:", e)
      );

      return Response.json({
        status: "GAME_COMPLETED",
        gameStatus: completedStatus,
        bonusUnlocked: session.bonusUnlocked,
        highScoreBonus,
        ...result,
        finalScore,
        progress,
      });
    }

    await updateSession(sessionId, session);
    await persistProgressSnapshot(session).catch((e) =>
      console.error("[evaluate] MongoDB progress snapshot error:", e)
    );
    const remainingOnPass = Math.max(
      0,
      (session.timeLimit - (session.penaltyTimeSec ?? 0) * 1000) - (Date.now() - session.startTime)
    );
    return Response.json({
      status: "ROUND_PASSED",
      nextRound: session.currentRound,
      attemptsThisRound: session.attemptsPerRound[roundNum],
      remainingTime: remainingOnPass,
      ...result,
      finalScore,
      progress,
    });
  }

  if (
    Number.isFinite(maxAttempts) &&
    (session.attemptsPerRound[roundNum] ?? 0) >= maxAttempts
  ) {
    const isBonusRound = roundNum > MAIN_ROUNDS;
    console.log("[evaluate] NO_ATTEMPTS_LEFT:post-eval", {
      sessionId,
      player: session.player.email ?? session.player.name,
      round: roundNum,
      attemptsUsed: session.attemptsPerRound[roundNum],
      maxAttempts,
      finalScore,
      isBonusRound,
    });

    if (!isBonusRound) {
      // Force-advance: override this round's score to 0 and move to the next round
      session.pendingRounds = [
        ...(session.pendingRounds ?? []).filter((r) => r.round !== roundNum),
        {
          round: roundNum,
          attempts: session.attemptsPerRound[roundNum],
          score: 0,
          prompt: round.type === "CLASSIFY" ? answers : prompt,
          output: ("output" in result ? result.output : undefined) ?? ("finalOutput" in result ? result.finalOutput : undefined) ?? "",
        },
      ];
      session.currentRound++;
      if (session.currentRound > MAIN_ROUNDS) session.bonusUnlocked = true;
      const metrics = derivePlayerMetrics(session.pendingRounds);
      session.player.roundsPlayed = metrics.roundsPlayed;
      session.player.roundsPassed = metrics.roundsPassed;
      session.player.totalScore = metrics.totalScore;
      session.player.averageScore = metrics.averageScore;
      await updateSession(sessionId, session);
      await persistProgressSnapshot(session).catch((e) =>
        console.error("[evaluate] MongoDB force-advance snapshot error:", e)
      );
      const remaining = Math.max(0, (session.timeLimit - (session.penaltyTimeSec ?? 0) * 1000) - (Date.now() - session.startTime));
      return Response.json({
        status: "ROUND_FORCE_ADVANCED",
        nextRound: session.currentRound,
        attemptsThisRound: session.attemptsPerRound[roundNum],
        remainingTime: remaining,
        ...result,
        finalScore: 0,
        progress: 0,
      });
    }

    // Bonus round: end game as completed
    session.pendingRounds = [
      ...(session.pendingRounds ?? []).filter((r) => r.round !== roundNum),
      {
        round: roundNum,
        attempts: session.attemptsPerRound[roundNum],
        score: 0,
        prompt: round.type === "CLASSIFY"
          ? answers
          : round.type === "BONUS"
            ? { metaPrompt, compiledPrompt: "compiledPrompt" in result ? result.compiledPrompt : undefined }
            : prompt,
        output: ("output" in result ? result.output : undefined) ?? ("finalOutput" in result ? result.finalOutput : undefined) ?? "",
      },
    ];
    const metrics = derivePlayerMetrics(session.pendingRounds);
    session.player.roundsPlayed = metrics.roundsPlayed;
    session.player.roundsPassed = metrics.roundsPassed;
    session.player.totalScore = metrics.totalScore;
    session.player.averageScore = metrics.averageScore;
    session.status = "COMPLETED";
    session.completed = true;
    session.player.completed = true;
    session.player.completedAt = Date.now();
    session.player.attemptsPerRound = { ...session.attemptsPerRound };
    session.player.timeLimit = session.timeLimit;
    session.player.gameStatus = "COMPLETED";
    savePlayer(session.player);
    await updateSession(sessionId, session);
    await persistTerminalSession(session, "COMPLETED").catch((e) =>
      console.error("[evaluate] MongoDB final-attempt failure error:", e)
    );
    return Response.json({
      status: "NO_ATTEMPTS_LEFT",
      round: roundNum,
      attempts: session.attemptsPerRound[roundNum],
      ...result,
      finalScore,
      progress,
    });
  }

  await updateSession(sessionId, session);
  await persistProgressSnapshot(session).catch((e) =>
    console.error("[evaluate] MongoDB progress snapshot error:", e)
  );
  const remainingOnFail = Math.max(
    0,
    (session.timeLimit - (session.penaltyTimeSec ?? 0) * 1000) - (Date.now() - session.startTime)
  );
  return Response.json({
    status: "ROUND_FAILED",
    attemptsThisRound: session.attemptsPerRound[roundNum],
    attemptsRemaining: Number.isFinite(maxAttempts)
      ? Math.max(0, maxAttempts - session.attemptsPerRound[roundNum])
      : -1,
    maxAttemptsThisRound: Number.isFinite(maxAttempts) ? maxAttempts : -1,
    remainingTime: remainingOnFail,
    ...result,
    finalScore,
    progress,
  });
}
