import { NextResponse } from "next/server";
import { connectDB } from "@server/lib/mongodb";
import PlayerModel from "@server/models/Player";

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
      .lean()) as PlayerDoc[];

    const leaderboard = docs
      .map((doc) => {
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
      })
      .sort((a, b) => {
        if (b.roundsPlayed !== a.roundsPlayed) return b.roundsPlayed - a.roundsPlayed;
        const timeA = (a.completedAt - a.startedAt) / (10 * 60 * 1000);
        const timeB = (b.completedAt - b.startedAt) / (10 * 60 * 1000);
        const scoreA = timeA - a.averageScore;
        const scoreB = timeB - b.averageScore;
        if (scoreA !== scoreB) return scoreA - scoreB;
        return b.averageScore - a.averageScore;
      });

    return NextResponse.json({ leaderboard });
  } catch (e) {
    console.error("[leaderboard]", e);
    return NextResponse.json({ leaderboard: [] });
  }
}
