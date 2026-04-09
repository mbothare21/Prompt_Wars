import type { Player } from "./types";
import { getPlayers } from "./playerStore";
import { rankPlayers } from "./ranking";

export type LeaderboardApiResponse = {
  leaderboard: Player[];
};

export function getLeaderboardResponse(): LeaderboardApiResponse {
  return {
    leaderboard: rankPlayers(getPlayers()),
  };
}
