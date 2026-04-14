import { NextResponse } from "next/server";
import { getLeaderboardResponse } from "@/lib/leaderboard";

export const runtime = "nodejs";

export async function GET() {
  try {
    const payload = await getLeaderboardResponse();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    });
  } catch (e) {
    console.error("[leaderboard]", e);
    return NextResponse.json(
      { leaderboard: [] },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      }
    );
  }
}
