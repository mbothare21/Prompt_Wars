import { isAdminEmail, verifyAdminToken } from "@/lib/admin";
import {
  getFallbackAdminPlayerExports,
  sortAdminPlayers,
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

  try {
    const db = await connectDB();
    if (!db) {
      return Response.json({ players: getFallbackAdminPlayerExports() });
    }

    const docs = (await PlayerModel.find({})
      .select("name email roundsPlayed timeTaken avgAccuracy attemptsTaken gameStatus createdAt completedAt rounds")
      .sort({ roundsPlayed: -1, avgAccuracy: -1, timeTaken: 1, attemptsTaken: 1 })
      .lean()) as RawAdminPlayerDoc[];

    const players = sortAdminPlayers(
      docs
        .filter((doc) =>
          !isAdminEmail(typeof doc.email === "string" ? doc.email : undefined)
        )
        .map((doc, index) => toAdminPlayerExport(doc, index))
    );

    return Response.json({ players });
  } catch (e) {
    console.error("[admin/export-leaderboard]", e);
    return Response.json({ players: getFallbackAdminPlayerExports() });
  }
}
