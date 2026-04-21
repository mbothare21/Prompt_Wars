import { getSession, updateSession } from "@/lib/gameStore";
import { savePlayer } from "@/lib/playerStore";
import { persistTerminalSession } from "@server/lib/playerPersistence";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { sessionId, violationType } = (await req.json()) as {
    sessionId: string;
    violationType: "TAB_SWITCH" | "COPY_PASTE";
  };

  const session = await getSession(sessionId);
  if (!session) {
    return Response.json({ error: "Invalid session" });
  }

  if (session.completed || session.status === "DISQUALIFIED") {
    return Response.json({ status: "ALREADY_ENDED" });
  }

  session.violations = (session.violations ?? 0) + 1;
  session.penaltyTimeSec = (session.penaltyTimeSec ?? 0) + 15;

  if (session.violations >= 3) {
    session.status = "DISQUALIFIED";
    session.completed = true;
    session.player.completed = true;
    session.player.completedAt = Date.now();
    session.player.attemptsPerRound = { ...session.attemptsPerRound };
    session.player.timeLimit = session.timeLimit;
    session.player.gameStatus = "DISQUALIFIED";
    savePlayer(session.player);
    await updateSession(sessionId, session);

    void persistTerminalSession(session, "DISQUALIFIED").catch((e) =>
      console.error("[penalty] MongoDB disqualify error:", e)
    );

    return Response.json({
      status: "DISQUALIFIED",
      violations: session.violations,
      violationType,
      message: "3 violations reached. You have been disqualified.",
    });
  }

  await updateSession(sessionId, session);

  const effectiveLimit = session.timeLimit - session.penaltyTimeSec * 1000;
  const remainingTime = effectiveLimit - (Date.now() - session.startTime);

  return Response.json({
    status: "PENALTY_APPLIED",
    violations: session.violations,
    violationType,
    penaltyTimeSec: 15,
    totalPenaltySec: session.penaltyTimeSec,
    remainingTime: Math.max(0, remainingTime),
    violationsRemaining: 3 - session.violations,
  });
}
