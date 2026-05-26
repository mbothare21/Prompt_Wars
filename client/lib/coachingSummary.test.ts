import { describe, expect, it } from "vitest";
import {
  buildCrossRoundCoachingSummary,
  collapseAttemptsToRoundScores,
} from "./coachingSummary";

describe("coachingSummary", () => {
  it("keeps the best score per round when collapsing attempts", () => {
    const rounds = collapseAttemptsToRoundScores([
      { round: 1, score: 0.4, attempts: 1 },
      { round: 1, score: 0.8, attempts: 2 },
      { round: 2, score: 0.55, attempts: 1 },
    ]);

    expect(rounds).toEqual([
      { round: 1, score: 0.8, attempts: 2 },
      { round: 2, score: 0.55, attempts: 1 },
    ]);
  });

  it("builds a holistic coaching summary across weak and strong rounds", () => {
    const summary = buildCrossRoundCoachingSummary([
      { round: 1, score: 0.82, attempts: 1 },
      { round: 2, score: 0.41, attempts: 3 },
      { round: 5, score: 0.52, attempts: 2 },
      { round: 6, score: 0.68, attempts: 1 },
    ]);

    expect(summary.headline).toBe("Cross-Round Coaching");
    expect(summary.overview.toLowerCase()).toContain("grounding");
    expect(summary.overview.toLowerCase()).toContain("structure");
    expect(summary.bullets.length).toBe(3);
  });
});
