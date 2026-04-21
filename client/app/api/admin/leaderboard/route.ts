import { compareCompetitiveStanding } from "@/lib/ranking";
import { isAdminEmail, verifyAdminToken } from "@/lib/admin";
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

  try {
    await connectDB();
    const docs = (await PlayerModel.find({})
      .select("name email roundsPlayed timeTaken avgAccuracy attemptsTaken gameStatus createdAt completedAt rounds")
      .sort({ roundsPlayed: -1, avgAccuracy: -1, timeTaken: 1, attemptsTaken: 1 })
      .lean()) as PlayerDoc[];

    const players = docs
      .filter((doc) => !isAdminEmail(doc.email))
      .map((doc) => ({
        playerId: doc._id.toString(),
        name: doc.name ?? "Unknown",
        email: doc.email,
        roundsPlayed: doc.roundsPlayed ?? 0,
        timeTakenSec: Math.round((doc.timeTaken ?? 0) / 1000),
        averageScore: doc.avgAccuracy ?? 0,
        attemptsUsed: doc.attemptsTaken ?? 0,
        completed:
          doc.gameStatus === "COMPLETED" || doc.gameStatus === "COMPLETED_WITH_BONUS",
        gameStatus: doc.gameStatus,
        rounds: (doc.rounds ?? []).map((round) => ({
          round: round.round ?? 0,
          attempts: round.attempts ?? 0,
          score: round.score ?? 0,
          prompt: round.prompt ?? null,
          output: round.output ?? "",
        })),
      }));

    players.sort((a, b) =>
      compareCompetitiveStanding(
        {
          roundsPlayed: a.roundsPlayed,
          averageScore: a.averageScore,
          timeTakenMs: a.timeTakenSec * 1000,
          attempts: a.attemptsUsed,
          name: a.name,
        },
        {
          roundsPlayed: b.roundsPlayed,
          averageScore: b.averageScore,
          timeTakenMs: b.timeTakenSec * 1000,
          attempts: b.attemptsUsed,
          name: b.name,
        }
      )
    );

    return Response.json({ players });
  } catch (e) {
    console.error("[admin/leaderboard]", e);
    return Response.json({ error: "Failed to fetch players" }, { status: 500 });
  }
}
