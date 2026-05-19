import { NextResponse } from "next/server";
import { getLeaderboardResponse } from "@/lib/leaderboard";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const bust = new URL(req.url).searchParams.has("t");
  const cacheHeader = bust
    ? "no-store"
    : "public, s-maxage=30, stale-while-revalidate=120";

  try {
    const payload = await getLeaderboardResponse(bust);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": cacheHeader },
    });
  } catch (e) {
    console.error("[leaderboard]", e);
    return NextResponse.json(
      { leaderboard: [] },
      { headers: { "Cache-Control": cacheHeader } }
    );
  }
}
