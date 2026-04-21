import type { Player } from "./types";
import { connectDB } from "@server/lib/mongodb";
import PlayerModel from "@server/models/Player";
import { getPlayers } from "./playerStore";
import { rankPlayers } from "./ranking";

export type LeaderboardApiResponse = {
  leaderboard: Player[];
};

let cachedLeaderboard: Player[] | null = null;
let lastFetchTime = 0;
let inflightLeaderboard: Promise<Player[]> | null = null;

const CACHE_TTL_MS = 30_000;
const STALE_TTL_MS = 2 * 60_000;

type DbLeaderboardPlayer = {
  _id?: string | { toString(): string };
  name?: string;
  email?: string;
  roundsPlayed?: number;
  timeTaken?: number;
  avgAccuracy?: number;
  attemptsTaken?: number;
  gameStatus?: Player["gameStatus"];
  createdAt?: Date;
  completedAt?: Date;
};

function normalizeDbPlayer(player: DbLeaderboardPlayer): Player {
  const startedAt =
    player.createdAt instanceof Date ? player.createdAt.getTime() : 0;
  const completedAt =
    player.completedAt instanceof Date
      ? player.completedAt.getTime()
      : undefined;
  const playerId =
    typeof player._id === "string"
      ? player._id
      : player._id?.toString() ?? `${player.email ?? player.name ?? "unknown"}-${startedAt}`;

  return {
    playerId,
    name: player.name ?? "Unknown",
    email: player.email,
    startedAt,
    completedAt,
    roundsPlayed: player.roundsPlayed ?? 0,
    totalScore: 0,
    averageScore: player.avgAccuracy ?? 0,
    attempts: player.attemptsTaken ?? 0,
    completed: true,
    timeLimit: 10 * 60 * 1000,
    gameStatus: player.gameStatus,
  };
}

async function fetchLeaderboardFromDb(now: number): Promise<Player[]> {
  await connectDB();
  const dbPlayers = await PlayerModel.find({
    completedAt: { $exists: true },
  })
    .select({
      name: 1,
      email: 1,
      roundsPlayed: 1,
      timeTaken: 1,
      avgAccuracy: 1,
      attemptsTaken: 1,
      gameStatus: 1,
      createdAt: 1,
      completedAt: 1,
    })
    .sort({ roundsPlayed: -1, avgAccuracy: -1, completedAt: 1 })
    .limit(50)
    .lean();

  const ranked = rankPlayers(
    (dbPlayers as DbLeaderboardPlayer[]).map(normalizeDbPlayer)
  );
  cachedLeaderboard = ranked;
  lastFetchTime = now;
  return ranked;
}

function getFallbackLeaderboard(): Player[] {
  return rankPlayers(
    getPlayers()
      .filter((player) => player.completed)
      .slice(0, 100)
  );
}

async function refreshLeaderboard(now: number): Promise<Player[]> {
  if (!inflightLeaderboard) {
    inflightLeaderboard = fetchLeaderboardFromDb(now).finally(() => {
      inflightLeaderboard = null;
    });
  }

  return inflightLeaderboard;
}

export async function getLeaderboardResponse(): Promise<LeaderboardApiResponse> {
  const now = Date.now();
  const cacheAge = now - lastFetchTime;

  if (cachedLeaderboard && cacheAge < CACHE_TTL_MS) {
    return { leaderboard: cachedLeaderboard };
  }

  if (cachedLeaderboard && cacheAge < STALE_TTL_MS) {
    void refreshLeaderboard(now).catch(() => {
      /* keep serving stale cache */
    });
    return { leaderboard: cachedLeaderboard };
  }

  try {
    return { leaderboard: await refreshLeaderboard(now) };
  } catch {
    if (cachedLeaderboard) {
      return { leaderboard: cachedLeaderboard };
    }
    return { leaderboard: getFallbackLeaderboard() };
  }
}
