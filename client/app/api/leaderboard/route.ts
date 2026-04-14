import { NextResponse } from "next/server";
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
  createdAt?: Date;
  completedAt?: Date;
};

export async function GET() {
  try {
    await connectDB();
    const docs = (await PlayerModel.find({})
      .select("name email roundsPlayed timeTaken avgAccuracy createdAt completedAt")
      .sort({ roundsPlayed: -1, avgAccuracy: -1 })
      .limit(50)
      .lean()) as PlayerDoc[];

    const leaderboard = docs.map((doc) => {
      const startedAt = doc.createdAt?.getTime() ?? 0;
      const timeTakenMs = doc.timeTaken ?? 0;
      const completedAt = doc.completedAt
        ? doc.completedAt.getTime()
        : startedAt + timeTakenMs;

      return {
        playerId: doc._id.toString(),
        name: doc.name ?? "Unknown",
        email: doc.email,
        roundsPlayed: doc.roundsPlayed ?? 0,
        startedAt,
        completedAt,
        averageScore: doc.avgAccuracy ?? 0,
        timeLimit: 10 * 60 * 1000,
      };
    });

    return NextResponse.json({ leaderboard });
  } catch (e) {
    console.error("[leaderboard]", e);
    return NextResponse.json({ leaderboard: [] });
  }
}
