import { isAdminEmail, verifyAdminToken } from "@/lib/admin";
import {
  toAdminPlayerExport,
  type RawAdminPlayerDoc,
} from "@/lib/adminPlayers";
import { connectDB } from "@server/lib/mongodb";
import PlayerModel from "@server/models/Player";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!verifyAdminToken(token)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return Response.json({ error: "Email is required" }, { status: 400 });
  }
  if (isAdminEmail(email)) {
    return Response.json({ error: "Player not found" }, { status: 404 });
  }

  try {
    const db = await connectDB();
    if (!db) {
      return Response.json(
        { error: "Player responses require MongoDB persistence" },
        { status: 503 }
      );
    }

    const doc = (await PlayerModel.findOne({ email })
      .select("name email roundsPlayed timeTaken avgAccuracy attemptsTaken gameStatus createdAt completedAt rounds")
      .lean()) as RawAdminPlayerDoc | null;

    if (!doc) {
      return Response.json({ error: "Player not found" }, { status: 404 });
    }

    return Response.json({
      player: toAdminPlayerExport(doc),
    });
  } catch (e) {
    console.error("[admin/player-responses]", e);
    return Response.json({ error: "Failed to fetch player data" }, { status: 500 });
  }
}
