// /lib/types.ts
export type GameStatus =
  | "COMPLETED"
  | "COMPLETED_WITH_BONUS"
  | "FAILED"
  | "TIME_OVER"
  | "DISQUALIFIED";

export type Player = {
  playerId: string;
  name: string;
  email?: string;
  startedAt: number;
  completedAt?: number;
  roundsPlayed: number;
  totalScore: number;
  averageScore: number;
  completed: boolean;
  attemptsPerRound?: Record<number, number>;
  timeLimit?: number;
  gameStatus?: GameStatus;
};

export type Round = {
  roundNumber: number;
  type?:
    | "IMPROVE"
    | "REVERSE"
    | "OPTIMIZE"
    | "STRUCTURED"
    | "CONSTRAINT_MASTER"
    | "BONUS"
    | "CLASSIFY";
  
  instruction?: string;
  /** Weak baseline prompt the player should improve on (optional). */
  originalPrompt?: string;
  input?: string;
  /** @deprecated prefer instruction + input */
  challenge?: string;
  expectedOutput?: string;
  expectedAnswer?: string;
  status?: string;
  constraints?: unknown;
  promptParts?: PromptPart[];
  basePrompt?: string;
  targetOutput?: string;
};

export type PromptPart = {
  id: string;
  text: string;
  options: string[];
  answer: string;
};

export type GameSession = {
  sessionId: string;
  player: Player;

  currentRound: number;
  rounds: Round[];

  startTime: number;
  timeLimit: number;

  completed: boolean;
  status: "ACTIVE" | "COMPLETED" | "TIME_UP" | "DISQUALIFIED";

  attemptsPerRound: Record<number, number>;
  maxAttemptsPerRound: number;

  scores: number[];
  bonusUnlocked: boolean;
  bonusAttempted?: boolean;
  bonusSubmittedAt?: number;

  violations: number;
  penaltyTimeSec: number;
  pendingRounds?: {
    round: number;
    attempts: number;
    score: number;
    prompt: unknown;
    output: string;
  }[];
};
