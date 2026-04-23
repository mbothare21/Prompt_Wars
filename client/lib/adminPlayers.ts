import { isAdminEmail } from "./admin";
import { getPlayers } from "./playerStore";
import { compareCompetitiveStanding, rankPlayers } from "./ranking";
import type { GameStatus, Player } from "./types";

type AdminRound = {
  round: number;
  attempts: number;
  score: number;
  prompt: unknown;
  output: string;
};

export type RawAdminPlayerDoc = {
  _id?: unknown;
  name?: unknown;
  email?: unknown;
  roundsPlayed?: unknown;
  timeTaken?: unknown;
  avgAccuracy?: unknown;
  attemptsTaken?: unknown;
  gameStatus?: unknown;
  createdAt?: unknown;
  completedAt?: unknown;
  rounds?: unknown;
};

export type AdminPlayerSummary = {
  playerId: string;
  name: string;
  email?: string;
  roundsPlayed: number;
  timeTakenSec: number;
  averageScore: number;
  attemptsUsed: number;
  completed: boolean;
  gameStatus?: string;
};

export type AdminPlayerExport = {
  _id: string;
  name: string;
  email?: string;
  roundsPlayed: number;
  timeTaken: number;
  avgAccuracy: number;
  attemptsTaken: number;
  gameStatus: string;
  createdAt?: string;
  completedAt?: string;
  rounds: AdminRound[];
};

type NormalizedAdminPlayer = {
  id: string;
  name: string;
  email?: string;
  roundsPlayed: number;
  timeTaken: number;
  avgAccuracy: number;
  attemptsTaken: number;
  gameStatus: string;
  createdAt?: string;
  completedAt?: string;
  rounds: AdminRound[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function toIsoString(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }

  return undefined;
}

function getFallbackPlayerId(
  email: string | undefined,
  name: string,
  createdAt: string | undefined,
  completedAt: string | undefined,
  index: number
) {
  const base = email ?? name.toLowerCase().replace(/\s+/g, "-");
  return `${base}-${createdAt ?? completedAt ?? `idx-${index}`}`;
}

function toPlayerId(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }

  if (value != null && typeof value === "object") {
    const maybeToString = (value as { toString?: unknown }).toString;
    if (typeof maybeToString === "function") {
      const result = maybeToString.call(value);
      if (typeof result === "string") {
        const trimmed = result.trim();
        if (trimmed && trimmed !== "[object Object]") return trimmed;
      }
    }
  }

  return fallback;
}

function normalizeRounds(value: unknown): AdminRound[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((round) => {
    if (!isRecord(round)) return [];

    return [
      {
        round: toFiniteNumber(round.round),
        attempts: toFiniteNumber(round.attempts),
        score: toFiniteNumber(round.score),
        prompt: round.prompt ?? null,
        output: toOptionalString(round.output) ?? "",
      },
    ];
  });
}

function isCompletedStatus(status: string) {
  return status === "COMPLETED" || status === "COMPLETED_WITH_BONUS";
}

function normalizeAdminPlayer(
  doc: RawAdminPlayerDoc,
  index = 0
): NormalizedAdminPlayer {
  const name = toOptionalString(doc.name) ?? "Unknown";
  const email = toOptionalString(doc.email);
  const createdAt = toIsoString(doc.createdAt);
  const completedAt = toIsoString(doc.completedAt);
  const fallbackId = getFallbackPlayerId(
    email,
    name,
    createdAt,
    completedAt,
    index
  );

  return {
    id: toPlayerId(doc._id, fallbackId),
    name,
    email,
    roundsPlayed: Math.max(0, toFiniteNumber(doc.roundsPlayed)),
    timeTaken: Math.max(0, toFiniteNumber(doc.timeTaken)),
    avgAccuracy: toFiniteNumber(doc.avgAccuracy),
    attemptsTaken: Math.max(0, toFiniteNumber(doc.attemptsTaken)),
    gameStatus: toOptionalString(doc.gameStatus) ?? "IN_PROGRESS",
    createdAt,
    completedAt,
    rounds: normalizeRounds(doc.rounds),
  };
}

export function toAdminPlayerSummary(
  doc: RawAdminPlayerDoc,
  index = 0
): AdminPlayerSummary {
  return toAdminPlayerSummaryShape(normalizeAdminPlayer(doc, index));
}

export function toAdminPlayerExport(
  doc: RawAdminPlayerDoc,
  index = 0
): AdminPlayerExport {
  return toAdminPlayerExportShape(normalizeAdminPlayer(doc, index));
}

function getPlayerAttemptCount(player: Player): number {
  if (typeof player.totalAttempts === "number") return player.totalAttempts;
  if (typeof player.attempts === "number") return player.attempts;

  return Object.values(player.attemptsPerRound ?? {}).reduce(
    (sum, value) => sum + toFiniteNumber(value),
    0
  );
}

function getPlayerGameStatus(player: Player): GameStatus | "IN_PROGRESS" {
  if (player.gameStatus) return player.gameStatus;
  return player.completed ? "COMPLETED" : "IN_PROGRESS";
}

function normalizeStoredPlayer(player: Player, index: number): NormalizedAdminPlayer {
  const name = toOptionalString(player.name) ?? "Unknown";
  const email = toOptionalString(player.email);
  const createdAt = toIsoString(player.startedAt);
  const completedAt = toIsoString(player.completedAt);

  return {
    id: toPlayerId(
      player.playerId,
      getFallbackPlayerId(email, name, createdAt, completedAt, index)
    ),
    name,
    email,
    roundsPlayed: Math.max(0, toFiniteNumber(player.roundsPlayed)),
    timeTaken:
      typeof player.completedAt === "number" && player.completedAt > 0
        ? Math.max(0, player.completedAt - player.startedAt)
        : 0,
    avgAccuracy: toFiniteNumber(player.averageScore),
    attemptsTaken: Math.max(0, getPlayerAttemptCount(player)),
    gameStatus: getPlayerGameStatus(player),
    createdAt,
    completedAt,
    rounds: [],
  };
}

function toAdminPlayerSummaryShape(player: NormalizedAdminPlayer): AdminPlayerSummary {
  return {
    playerId: player.id,
    name: player.name,
    email: player.email,
    roundsPlayed: player.roundsPlayed,
    timeTakenSec: Math.round(
      player.timeTaken > 10_000 ? player.timeTaken / 1000 : player.timeTaken
    ),
    averageScore: player.avgAccuracy,
    attemptsUsed: player.attemptsTaken,
    completed: isCompletedStatus(player.gameStatus),
    gameStatus: player.gameStatus,
  };
}

function toAdminPlayerExportShape(player: NormalizedAdminPlayer): AdminPlayerExport {
  return {
    _id: player.id,
    name: player.name,
    email: player.email,
    roundsPlayed: player.roundsPlayed,
    timeTaken: player.timeTaken,
    avgAccuracy: player.avgAccuracy,
    attemptsTaken: player.attemptsTaken,
    gameStatus: player.gameStatus,
    createdAt: player.createdAt,
    completedAt: player.completedAt,
    rounds: player.rounds,
  };
}

export function sortAdminPlayers<
  T extends {
    roundsPlayed: number;
    avgAccuracy: number;
    timeTaken: number;
    attemptsTaken: number;
    name: string;
  },
>(players: T[]): T[] {
  return players.sort((a, b) =>
    compareCompetitiveStanding(
      {
        roundsPlayed: a.roundsPlayed,
        averageScore: a.avgAccuracy,
        timeTakenMs: a.timeTaken,
        attempts: a.attemptsTaken,
        name: a.name,
      },
      {
        roundsPlayed: b.roundsPlayed,
        averageScore: b.avgAccuracy,
        timeTakenMs: b.timeTaken,
        attempts: b.attemptsTaken,
        name: b.name,
      }
    )
  );
}

function getMemoryPlayers(): Player[] {
  return rankPlayers(getPlayers().filter((player) => !isAdminEmail(player.email)));
}

export function getFallbackAdminPlayerSummaries(): AdminPlayerSummary[] {
  return getMemoryPlayers().map((player, index) =>
    toAdminPlayerSummaryShape(normalizeStoredPlayer(player, index))
  );
}

export function getFallbackAdminPlayerExports(): AdminPlayerExport[] {
  return getMemoryPlayers().map((player, index) =>
    toAdminPlayerExportShape(normalizeStoredPlayer(player, index))
  );
}
