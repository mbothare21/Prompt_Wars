import { isAdminEmail, verifyAdminToken } from "@/lib/admin";
import {
  getFallbackAdminPlayerSummaries,
  sortAdminPlayers,
  toAdminPlayerExport,
  toAdminPlayerSummary,
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
      return Response.json({ players: getFallbackAdminPlayerSummaries() });
    }

    const docs = (await PlayerModel.find({})
      .select("name email roundsPlayed timeTaken avgAccuracy attemptsTaken gameStatus")
      .sort({ roundsPlayed: -1, avgAccuracy: -1, timeTaken: 1, attemptsTaken: 1 })
      .lean()) as RawAdminPlayerDoc[];

    const players = sortAdminPlayers(
      docs
        .filter((doc) =>
          !isAdminEmail(typeof doc.email === "string" ? doc.email : undefined)
        )
        .map((doc, index) => {
          const full = toAdminPlayerExport(doc, index);
          const summary = toAdminPlayerSummary(doc, index);

          return {
            summary,
            name: full.name,
            roundsPlayed: full.roundsPlayed,
            avgAccuracy: full.avgAccuracy,
            timeTaken: full.timeTaken,
            attemptsTaken: full.attemptsTaken,
          };
        })
    ).map(({ summary }) => summary);

    return Response.json({ players });
  } catch (e) {
    console.error("[admin/leaderboard]", e);
    return Response.json({ players: getFallbackAdminPlayerSummaries() });
  }
}
