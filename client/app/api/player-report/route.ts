import { getSession } from "@/lib/gameStore";
import { toAdminPlayerExport, type RawAdminPlayerDoc } from "@/lib/adminPlayers";
import { connectDB } from "@server/lib/mongodb";
import PlayerModel from "@server/models/Player";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return Response.json({ error: "sessionId is required" }, { status: 400 });
  }

  const session = await getSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found or expired" }, { status: 404 });
  }

  const email = session.player.email;
  if (!email) {
    return Response.json({ error: "No email associated with this session" }, { status: 400 });
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

    return Response.json({ player: toAdminPlayerExport(doc) });
  } catch (e) {
    console.error("[player-report]", e);
    return Response.json({ error: "Failed to fetch player data" }, { status: 500 });
  }
}
