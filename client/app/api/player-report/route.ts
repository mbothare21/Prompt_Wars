import { getSession } from "@/lib/gameStore";
import { toAdminPlayerExport, type RawAdminPlayerDoc } from "@/lib/adminPlayers";
import { generateRoundTips } from "@/lib/roundTips";
import { connectDB } from "@server/lib/mongodb";
import PlayerModel from "@server/models/Player";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId")?.trim();
  const emailParam = searchParams.get("email")?.trim().toLowerCase();

  if (!sessionId && !emailParam) {
    return Response.json({ error: "sessionId is required" }, { status: 400 });
  }

  let email: string | undefined;

  if (sessionId) {
    const session = await getSession(sessionId);
    email = session?.player.email;
  }

  // Fall back to email param when session has expired (e.g. serverless cold start, no Redis)
  if (!email && emailParam) {
    email = emailParam;
  }

  if (!email) {
    return Response.json({ error: "Session not found or expired" }, { status: 404 });
  }

  try {
    const db = await connectDB();
    if (!db) {
      return Response.json(
        { error: "Player report requires MongoDB persistence" },
        { status: 503 }
      );
    }

    const doc = (await PlayerModel.findOne({ email })
      .select(
        "name email roundsPlayed timeTaken avgAccuracy attemptsTaken gameStatus createdAt completedAt rounds"
      )
      .lean()) as RawAdminPlayerDoc | null;

    if (!doc) {
      return Response.json({ error: "Player not found" }, { status: 404 });
    }

    const player = toAdminPlayerExport(doc);
    const tips = await generateRoundTips(player.rounds);
    return Response.json({ player, tips });
  } catch (e) {
    console.error("[player-report]", e);
    return Response.json({ error: "Failed to fetch player data" }, { status: 500 });
  }
}
