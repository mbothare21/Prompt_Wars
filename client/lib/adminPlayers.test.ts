import { beforeEach, describe, expect, it } from "vitest";
import {
  getFallbackAdminPlayerSummaries,
  toAdminPlayerExport,
  toAdminPlayerSummary,
} from "./adminPlayers";
import { clearPlayers, savePlayer } from "./playerStore";

describe("adminPlayers", () => {
  beforeEach(() => {
    clearPlayers();
  });

  it("serializes malformed db rows without throwing", () => {
    const player = toAdminPlayerExport(
      {
        _id: null,
        name: 42,
        email: "case@example.com",
        roundsPlayed: "3",
        timeTaken: "12000",
        avgAccuracy: "0.82",
        attemptsTaken: "5",
        gameStatus: null,
        createdAt: "",
        completedAt: "not-a-date",
        rounds: [
          null,
          "bad-row",
          {
            round: "2",
            attempts: "3",
            score: "0.7",
            prompt: { kind: "structured" },
            output: 99,
          },
          {
            round: 3,
            attempts: 1,
            score: 0.95,
            prompt: "final prompt",
            output: "answer",
          },
        ],
      },
      7
    );

    expect(player._id).toContain("case@example.com");
    expect(player.name).toBe("Unknown");
    expect(player.roundsPlayed).toBe(3);
    expect(player.timeTaken).toBe(12000);
    expect(player.avgAccuracy).toBe(0.82);
    expect(player.attemptsTaken).toBe(5);
    expect(player.gameStatus).toBe("IN_PROGRESS");
    expect(player.createdAt).toBeUndefined();
    expect(player.completedAt).toBeUndefined();
    expect(player.rounds).toEqual([
      {
        round: 2,
        attempts: 3,
        score: 0.7,
        prompt: { kind: "structured" },
        output: "",
      },
      {
        round: 3,
        attempts: 1,
        score: 0.95,
        prompt: "final prompt",
        output: "answer",
      },
    ]);
  });

  it("builds the lightweight summary shape used by the admin roster", () => {
    const summary = toAdminPlayerSummary({
      _id: { toString: () => "player-1" },
      name: "Rhea",
      email: "rhea@example.com",
      roundsPlayed: 4,
      timeTaken: 15234,
      avgAccuracy: 0.91,
      attemptsTaken: 6,
      gameStatus: "COMPLETED",
    });

    expect(summary).toEqual({
      playerId: "player-1",
      name: "Rhea",
      email: "rhea@example.com",
      roundsPlayed: 4,
      timeTakenSec: 15,
      averageScore: 0.91,
      attemptsUsed: 6,
      completed: true,
      gameStatus: "COMPLETED",
    });
  });

  it("falls back to the in-memory player store when db data is unavailable", () => {
    savePlayer({
      playerId: "memory-1",
      name: "Stored Agent",
      email: "stored@example.com",
      startedAt: 1_700_000_000_000,
      completedAt: 1_700_000_012_345,
      roundsPlayed: 5,
      totalScore: 0,
      averageScore: 0.88,
      completed: true,
      attempts: 7,
      gameStatus: "COMPLETED_WITH_BONUS",
    });

    expect(getFallbackAdminPlayerSummaries()).toEqual([
      {
        playerId: "memory-1",
        name: "Stored Agent",
        email: "stored@example.com",
        roundsPlayed: 5,
        timeTakenSec: 12,
        averageScore: 0.88,
        attemptsUsed: 7,
        completed: true,
        gameStatus: "COMPLETED_WITH_BONUS",
      },
    ]);
  });
});
