import { isAdminEmail, isAdminIdentity } from "@/lib/admin";
import type { GameSession, GameStatus } from "@/lib/types";
import { connectDB } from "./mongodb";
import PlayerModel from "../models/Player";

type PersistedGameStatus = GameStatus | "IN_PROGRESS";

const TERMINAL_GAME_STATUSES: ReadonlyArray<GameStatus> = [
  "COMPLETED",
  "COMPLETED_WITH_BONUS",
  "FAILED",
  "TIME_OVER",
  "DISQUALIFIED",
];

function getCreatedAt(session: GameSession): Date {
  return new Date(session.player.startedAt || session.startTime || Date.now());
}

function getCompletedAt(session: GameSession): Date {
  return new Date(session.player.completedAt || Date.now());
}

function getTotalAttempts(session: GameSession): number {
  return Object.values(session.attemptsPerRound).reduce((sum, value) => sum + value, 0);
}

function getBaseInsertFields(session: GameSession) {
  return {
    email: session.player.email,
    createdAt: getCreatedAt(session),
  };
}

function shouldSkipPersistence(session: GameSession): boolean {
  return (
    !session.player.email ||
    isAdminIdentity(session.player.name, session.player.email)
  );
}

async function upsertPlayerSnapshot(
  session: GameSession,
  gameStatus: PersistedGameStatus,
  location?: string
): Promise<void> {
  if (shouldSkipPersistence(session)) return;

  const db = await connectDB();
  if (!db) return;

  const completedAt =
    gameStatus === "IN_PROGRESS" ? undefined : getCompletedAt(session);

  // Never downgrade a terminal record back to IN_PROGRESS. A stale or
  // out-of-order progress snapshot must not erase a recorded completion.
  const filter: Record<string, unknown> = { email: session.player.email };
  if (gameStatus === "IN_PROGRESS") {
    filter.gameStatus = { $nin: TERMINAL_GAME_STATUSES };
  }

  try {
    await PlayerModel.updateOne(
      filter,
      {
        $setOnInsert: {
          ...getBaseInsertFields(session),
          ...(location ? { location } : {}),
        },
        $set: {
          name: session.player.name,
          sessionId: session.sessionId,
          roundsPlayed: session.player.roundsPlayed,
          roundsPassed: session.player.roundsPassed ?? session.player.roundsPlayed,
          timeTaken: Math.max(0, Date.now() - session.startTime),
          avgAccuracy: session.player.averageScore,
          attemptsTaken: getTotalAttempts(session),
          gameStatus,
          lastActivityAt: new Date(),
          rounds: session.pendingRounds ?? [],
          ...(completedAt ? { completedAt } : {}),
        },
        $unset: {
          ...(completedAt ? {} : { completedAt: "" }),
          responseReport: "",
        },
      },
      { upsert: true }
    );
  } catch (error) {
    // An IN_PROGRESS write whose filter excludes terminal docs can hit the
    // unique-email index when the existing record is already terminal — that
    // means a completion is already on file, so the stale progress write is
    // intentionally a no-op.
    if (gameStatus === "IN_PROGRESS" && isDuplicateKeyError(error)) return;
    throw error;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: number }).code;
  return code === 11000 || code === 11001;
}

export async function findCompletedPlayerByEmail(email: string): Promise<boolean> {
  if (isAdminEmail(email)) return false;

  const db = await connectDB();
  if (!db) return false;

  const existing = await PlayerModel.exists({
    email,
    completedAt: { $exists: true },
  });

  return Boolean(existing);
}

export async function findAnyPlayerAttemptByEmail(email: string): Promise<boolean> {
  if (isAdminEmail(email)) return false;

  const db = await connectDB();
  if (!db) return false;

  const existing = await PlayerModel.exists({ email });
  return Boolean(existing);
}

export async function ensurePlayerRecord(session: GameSession, location?: string): Promise<void> {
  if (shouldSkipPersistence(session)) return;
  await upsertPlayerSnapshot(session, "IN_PROGRESS", location);
}

export async function persistProgressSnapshot(session: GameSession): Promise<void> {
  await upsertPlayerSnapshot(session, "IN_PROGRESS");
}

export async function persistTerminalSession(
  session: GameSession,
  gameStatus: GameStatus
): Promise<void> {
  await upsertPlayerSnapshot(session, gameStatus);
}
