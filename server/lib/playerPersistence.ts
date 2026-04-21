import { isAdminEmail, isAdminIdentity } from "@/lib/admin";
import type { GameSession, GameStatus } from "@/lib/types";
import { connectDB } from "./mongodb";
import PlayerModel from "../models/Player";

type PersistedGameStatus = GameStatus | "IN_PROGRESS";

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
  gameStatus: PersistedGameStatus
): Promise<void> {
  if (shouldSkipPersistence(session)) return;

  const db = await connectDB();
  if (!db) return;

  const completedAt =
    gameStatus === "IN_PROGRESS" ? undefined : getCompletedAt(session);

  await PlayerModel.updateOne(
    { email: session.player.email },
    {
      $setOnInsert: getBaseInsertFields(session),
      $set: {
        name: session.player.name,
        roundsPlayed: session.player.roundsPlayed,
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

export async function ensurePlayerRecord(session: GameSession): Promise<void> {
  if (shouldSkipPersistence(session)) return;
  await upsertPlayerSnapshot(session, "IN_PROGRESS");
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
