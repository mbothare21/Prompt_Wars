import { NextResponse } from "next/server";
import { getLeaderboardResponse } from "@/lib/leaderboard";

export async function GET() {
  return NextResponse.json(getLeaderboardResponse());
}
