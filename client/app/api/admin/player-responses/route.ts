import { verifyAdminToken } from "@/lib/admin";
import { connectDB } from "@server/lib/mongodb";
import PlayerModel from "@server/models/Player";

export const runtime = "nodejs";

type PlayerDoc = {
  _id: { toString(): string };
  name?: string;
  email?: string;
  roundsPlayed?: number;
  timeTaken?: number;
  avgAccuracy?: number;
  attemptsTaken?: number;
  gameStatus?: string;
  createdAt?: Date;
  completedAt?: Date;
  rounds?: {
    round?: number;
    attempts?: number;
    score?: number;
    prompt?: unknown;
    output?: string;
  }[];
};

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

  try {
    await connectDB();
    const doc = (await PlayerModel.findOne({ email })
      .select("name email roundsPlayed timeTaken avgAccuracy attemptsTaken gameStatus createdAt completedAt rounds")
      .lean()) as PlayerDoc | null;

    if (!doc) {
      return Response.json({ error: "Player not found" }, { status: 404 });
    }

    return Response.json({
      player: {
        _id: doc._id.toString(),
        name: doc.name ?? "Unknown",
        email: doc.email ?? email,
        roundsPlayed: doc.roundsPlayed ?? 0,
        timeTaken: doc.timeTaken ?? 0,
        avgAccuracy: doc.avgAccuracy ?? 0,
        attemptsTaken: doc.attemptsTaken ?? 0,
        gameStatus: doc.gameStatus ?? "IN_PROGRESS",
        createdAt: doc.createdAt?.toISOString(),
        completedAt: doc.completedAt?.toISOString(),
        rounds: (doc.rounds ?? []).map((round) => ({
          round: round.round ?? 0,
          attempts: round.attempts ?? 0,
          score: round.score ?? 0,
          prompt: round.prompt ?? null,
          output: round.output ?? "",
        })),
      },
    });
  } catch (e) {
    console.error("[admin/player-responses]", e);
    return Response.json({ error: "Failed to fetch player data" }, { status: 500 });
  }
}
