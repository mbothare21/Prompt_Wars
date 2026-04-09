import type { Player } from "./types";

const players: Player[] = [];

export function savePlayer(player: Player) {
  const idx = players.findIndex((p) => p.playerId === player.playerId);
  if (idx >= 0) {
    players[idx] = { ...player };
  } else {
    players.push({ ...player });
  }
}

export function getPlayers(): Player[] {
  return players;
}

/** Clears stored players (for tests). */
export function clearPlayers() {
  players.length = 0;
}
