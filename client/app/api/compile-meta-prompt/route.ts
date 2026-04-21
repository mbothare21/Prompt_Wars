import { getSession, updateSession } from "@/lib/gameStore";
import { isTimeUp } from "@/lib/time";
import { compileMetaPrompt } from "@/lib/evaluator";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { sessionId, metaPrompt } = (await req.json()) as {
    sessionId?: string;
    metaPrompt?: string;
  };

  if (!sessionId || typeof sessionId !== "string") {
    return Response.json({ error: "Invalid session" }, { status: 400 });
  }

  if (typeof metaPrompt !== "string" || metaPrompt.trim().length < 3) {
    return Response.json(
      { error: "Meta prompt must be at least 3 characters." },
      { status: 400 }
    );
  }

  const session = await getSession(sessionId);
  if (!session) {
    return Response.json({ error: "Invalid session" }, { status: 404 });
  }

  if (session.completed || session.status === "DISQUALIFIED") {
    return Response.json(
      { error: "Session is no longer active." },
      { status: 409 }
    );
  }

  if (isTimeUp(session)) {
    return Response.json({ error: "Time is up." }, { status: 409 });
  }

  const round = session.rounds[session.currentRound - 1];
  if (round.type !== "BONUS") {
    return Response.json(
      { error: "Meta prompt preview is only available in the bonus round." },
      { status: 400 }
    );
  }

  if (!session.bonusUnlocked) {
    session.bonusUnlocked = true;
    await updateSession(sessionId, session);
  }

  try {
    const compiledPrompt = await compileMetaPrompt({
      metaPrompt,
      basePrompt: round.input ?? "",
    });

    return Response.json({
      status: "COMPILED",
      compiledPrompt,
      remainingTime:
        (session.timeLimit - (session.penaltyTimeSec ?? 0) * 1000) -
        (Date.now() - session.startTime),
    });
  } catch (error) {
    console.error("[compile-meta-prompt] compile error:", error);
    return Response.json(
      { error: "Failed to compile meta prompt." },
      { status: 500 }
    );
  }
}
