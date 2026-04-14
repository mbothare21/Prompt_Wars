import { generateRounds } from "./generateRounds";
import type { Round } from "./types";

type GlobalRoundsCache = typeof globalThis & {
  __promptWarsRounds?: Round[];
};

const globalRounds = globalThis as GlobalRoundsCache;

export function getRounds(): Round[] {
  if (!globalRounds.__promptWarsRounds) {
    globalRounds.__promptWarsRounds = generateRounds();
  }

  return globalRounds.__promptWarsRounds;
}
