import type { Player } from "./types";
import { getPlayers } from "./playerStore";
import { rankPlayers } from "./ranking";

export type LeaderboardApiResponse = {
  leaderboard: Player[];
};

let cachedLeaderboard: Player[] | null = null;
let lastFetchTime = 0;

const CACHE_TTL = 5000; // 5 seconds

export function getLeaderboardResponse(): LeaderboardApiResponse {
  const now = Date.now();

  if (cachedLeaderboard && now - lastFetchTime < CACHE_TTL) {
    return { leaderboard: cachedLeaderboard };
  }

  const players = getPlayers().slice(0, 100);
  const ranked = rankPlayers(players);

  cachedLeaderboard = ranked;
  lastFetchTime = now;

  return { leaderboard: ranked };
}
