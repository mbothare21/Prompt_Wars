import { isAdminEmail, verifyAdminToken } from "@/lib/admin";
import {
  toAdminPlayerExport,
  type RawAdminPlayerDoc,
} from "@/lib/adminPlayers";
import { generateRoundTips } from "@/lib/roundTips";
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
  const email = searchParams.get("email")?.trim();
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

    const emailFilter = { email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } };
    const doc = (await PlayerModel.findOne(emailFilter)
      .select("name email roundsPlayed timeTaken avgAccuracy attemptsTaken gameStatus createdAt completedAt rounds")
      .lean()) as RawAdminPlayerDoc | null;

    if (!doc) {
      console.log("[player-responses] NOT_FOUND", { email });
      return Response.json({ error: "Player not found" }, { status: 404 });
    }

    const player = toAdminPlayerExport(doc);
    let tips: Record<number, string> = {};
    try {
      tips = await generateRoundTips(player.rounds);
    } catch (e) {
      console.error("[admin/player-responses] tips generation failed:", e);
    }
    return Response.json({ player, tips });
  } catch (e) {
    console.error("[admin/player-responses]", e);
    return Response.json({ error: "Failed to fetch player data" }, { status: 500 });
  }
}
