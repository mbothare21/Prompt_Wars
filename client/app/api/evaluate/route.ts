import { getSession, updateSession } from "@/lib/gameStore";
import { isTimeUp } from "@/lib/time";
import { evaluateRound, evaluateMetaBonusRound } from "@/lib/evaluator";
import { savePlayer } from "@/lib/playerStore";
import { connectDB } from "@server/lib/mongodb";
import PlayerModel from "@server/models/Player";

const BONUS_SCORE_THRESHOLD = 0.92;

// Per-round pass thresholds (roundNumber → minimum score to advance)
const PASS_THRESHOLDS: Record<number, number> = {
  1: 1.00,  // MCQ — all 4 correct
  2: 0.70,
  3: 0.65,
  4: 0.60,
  5: 0.60,
  6: 0.60,  // bonus
};

export async function POST(req: Request) {
  const { sessionId, prompt, answers, metaPrompt, finalPrompt } = await req.json() as {
    sessionId: string;
    prompt?: string;
    answers?: Record<string, string>;
    metaPrompt?: string;
    finalPrompt?: string;
  };

  const session = getSession(sessionId);

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
        console.error("[evaluate] MongoDB time-up error:", e);
      }
    }

    return Response.json({
      status: "GAME_OVER",
      reason: "TIME_UP",
    });
  }

  const effectiveLimit = session.timeLimit - (session.penaltyTimeSec ?? 0) * 1000;
  const timeLeft = effectiveLimit - (Date.now() - session.startTime);

  if (
    session.currentRound > 5 &&
    timeLeft > 0 &&
    !session.bonusUnlocked
  ) {
    session.bonusUnlocked = true;
    updateSession(sessionId, session);

    return Response.json({
      status: "BONUS_AVAILABLE",
      remainingTime: timeLeft,
    });
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
      return Response.json({
        status: "INVALID_SUBMISSION",
        message: "Both inputs are required",
      });
    }

    if (session.bonusAttempted) {
      return Response.json({ error: "Already attempted" });
    }

    session.bonusAttempted = true; // lock immediately
  }

  session.attemptsPerRound[roundNum] =
    (session.attemptsPerRound[roundNum] || 0) + 1;

  // Rounds 1-3: unlimited. Rounds 4-5: 3 attempts. Bonus: 1 (handled above).
  // Round 1-3: unlimited, Round 4: 3 attempts, Round 5: 2 attempts, Bonus: 1 (handled above)
  const ATTEMPT_LIMITS: Record<number, number> = { 4: 3, 5: 2 };
  const maxAttempts = ATTEMPT_LIMITS[roundNum] ?? Infinity;

  if (Number.isFinite(maxAttempts) && session.attemptsPerRound[roundNum] > maxAttempts) {
    session.status = "DISQUALIFIED";
    session.completed = true;
    session.player.attemptsPerRound = { ...session.attemptsPerRound };
    session.player.timeLimit = session.timeLimit;
    session.player.gameStatus = "FAILED";
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
              gameStatus: "FAILED",
              completedAt: new Date(),
            },
          }
        );
      } catch (e) {
        console.error("[evaluate] MongoDB attempts-exhausted error:", e);
      }
    }

    return Response.json({
      status: "NO_ATTEMPTS_LEFT",
      round: roundNum,
      attempts: session.attemptsPerRound[roundNum],
    });
  }

  const result = round.type === "BONUS"
    ? await evaluateMetaBonusRound({
        metaPrompt: metaPrompt ?? "",
        finalPrompt: finalPrompt ?? "",
        basePrompt: round.input ?? "",
        targetOutput: round.targetOutput ?? round.expectedOutput ?? "",
      })
    : await evaluateRound(round, prompt ?? "", answers);

  let finalScore = result.finalScore;
  let progress = result.progress;
  if (round.type === "BONUS") {
    finalScore *= 1.5;
    progress = Math.round(finalScore * 100);
  }

  session.player.roundsPlayed += 1;
  session.player.totalScore += finalScore;
  session.scores.push(finalScore);
  session.player.averageScore =
    session.player.totalScore / session.scores.length;

  // Save round data to MongoDB
  if (session.player.email) {
    try {
      await connectDB();
      await PlayerModel.updateOne(
        { email: session.player.email },
        {
          $push: {
            rounds: {
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
          },
        }
      );
    } catch (e) {
      console.error("[evaluate] MongoDB round push error:", e);
    }
  }

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
      updateSession(sessionId, session);

      // Update final stats in MongoDB
      if (session.player.email) {
        try {
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
                gameStatus: completedStatus,
                completedAt: new Date(),
              },
            }
          );
        } catch (e) {
          console.error("[evaluate] MongoDB completion error:", e);
        }
      }

      return Response.json({
        status: "GAME_COMPLETED",
        bonusUnlocked: session.bonusUnlocked,
        highScoreBonus,
        ...result,
        finalScore,
        progress,
      });
    }

    updateSession(sessionId, session);

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
