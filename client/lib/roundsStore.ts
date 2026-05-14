import { generateRounds } from "./generateRounds";
import type { Round } from "./types";

export function getRounds(sessionId: string): Round[] {
  return generateRounds(sessionId);
}
