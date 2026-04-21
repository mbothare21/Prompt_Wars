import type { GameSession, GameStatus } from "@/lib/types";
import { connectDB } from "./mongodb";
import PlayerModel from "../models/Player";

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

export async function findCompletedPlayerByEmail(email: string): Promise<boolean> {
  const db = await connectDB();
  if (!db) return false;

  const existing = await PlayerModel.exists({
    email,
    completedAt: { $exists: true },
  });

  return Boolean(existing);
}

export async function ensurePlayerRecord(session: GameSession): Promise<void> {
  if (!session.player.email) return;

  const db = await connectDB();
  if (!db) return;

  await PlayerModel.updateOne(
    { email: session.player.email },
    {
      $setOnInsert: getBaseInsertFields(session),
      $set: {
        name: session.player.name,
        roundsPlayed: 0,
        timeTaken: 0,
        avgAccuracy: 0,
        attemptsTaken: 0,
        rounds: [],
      },
    },
    { upsert: true }
  );
}

export async function persistTerminalSession(
  session: GameSession,
  gameStatus: GameStatus
): Promise<void> {
  if (!session.player.email) return;

  const db = await connectDB();
  if (!db) return;

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
        completedAt: getCompletedAt(session),
        rounds: session.pendingRounds ?? [],
      },
    },
    { upsert: true }
  );
}
