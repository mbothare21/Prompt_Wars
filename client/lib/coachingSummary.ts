const ROUND_LABELS: Record<number, string> = {
  1: "Classification",
  2: "Prompt Improvement",
  3: "Reverse Engineering",
  4: "Optimization",
  5: "Structured Output",
  6: "Bonus Challenge",
};

export type CoachingRound = {
  round: number;
  score: number;
  attempts?: number;
};

export type CoachingSummary = {
  headline: string;
  overview: string;
  bullets: string[];
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function roundPct(value: number): number {
  return Math.round(clampScore(value) * 100);
}

function formatRoundLabel(round: number): string {
  return ROUND_LABELS[round] ?? `Round ${round}`;
}

export function collapseAttemptsToRoundScores(rounds: CoachingRound[]): CoachingRound[] {
  const bestByRound = new Map<number, CoachingRound>();

  for (const round of rounds) {
    if (!Number.isFinite(round.round)) continue;
    const score = clampScore(round.score);
    const current = bestByRound.get(round.round);
    if (
      !current ||
      score > current.score ||
      (score === current.score && (round.attempts ?? 0) > (current.attempts ?? 0))
    ) {
      bestByRound.set(round.round, {
        round: round.round,
        score,
        attempts: round.attempts,
      });
    }
  }

  return Array.from(bestByRound.values()).sort((a, b) => a.round - b.round);
}

function listLabels(rounds: CoachingRound[]): string {
  return rounds.map((round) => formatRoundLabel(round.round)).join(", ");
}

function buildWeaknessTheme(weakRounds: CoachingRound[]): string {
  const weakRoundNumbers = [...new Set(weakRounds.map((round) => round.round))].sort((a, b) => a - b);
  if (weakRoundNumbers.length === 0) {
    return "The main opportunity is to keep tightening prompts that sit near the pass threshold.";
  }

  if (weakRoundNumbers.includes(2) && weakRoundNumbers.includes(5)) {
    return "The recurring gap is control: prompts need tighter grounding in the input data and stricter structure and format discipline.";
  }

  if (weakRoundNumbers.includes(2) || weakRoundNumbers.includes(6)) {
    return "The recurring gap is grounding: the prompt needs to stay inside the provided data and explicitly block extra invention.";
  }

  if (weakRoundNumbers.includes(5)) {
    return "The recurring gap is structure: prompts should match the required sections and formatting more exactly.";
  }

  if (weakRoundNumbers.includes(1)) {
    return "The recurring gap is classification precision: the prompt needs clearer boundaries and fewer broad labels.";
  }

  if (weakRoundNumbers.includes(3)) {
    return "The recurring gap is reconstruction: the prompt should work backward from the expected output more deliberately.";
  }

  if (weakRoundNumbers.includes(4)) {
    return "The recurring gap is compression: the prompt should cut filler and keep only the most useful instructions.";
  }

  return `The weaker rounds cluster around ${weakRoundNumbers.map(formatRoundLabel).join(", ")}, which points to a need for more specificity and control.`;
}

function buildStrengthTheme(strongRounds: CoachingRound[]): string {
  const strongRoundNumbers = [...new Set(strongRounds.map((round) => round.round))].sort((a, b) => a - b);
  if (strongRoundNumbers.length === 0) {
    return "The strongest next move is to keep the useful structure from your better rounds and apply it more consistently.";
  }

  if (strongRoundNumbers.includes(4) || strongRoundNumbers.includes(5) || strongRoundNumbers.includes(6)) {
    return "Your strongest signal is control: when the round rewards structure or precision, your prompts get much cleaner.";
  }

  if (strongRoundNumbers.includes(2)) {
    return "You handle constraint-heavy prompting well when the instructions are explicit.";
  }

  if (strongRoundNumbers.includes(1)) {
    return "You are strongest when the task has clear categories and the decision boundary is obvious.";
  }

  return `Your strongest rounds are ${strongRoundNumbers.map(formatRoundLabel).join(", ")}, which shows you can adapt well once the task shape is clear.`;
}

function buildAttemptTheme(rounds: CoachingRound[]): string {
  const multiAttemptRounds = rounds.filter((round) => (round.attempts ?? 0) > 1);
  if (multiAttemptRounds.length === 0) {
    return "Several rounds cleared quickly, so the next gain comes from making the same control show up everywhere.";
  }

  if (multiAttemptRounds.length === 1) {
    return `${formatRoundLabel(multiAttemptRounds[0].round)} needed multiple attempts, so careful rewrites are still paying off.`;
  }

  return `${listLabels(multiAttemptRounds)} needed multiple attempts, which suggests the strongest gains still come from slower, tighter rewrites before submitting.`;
}

export function buildCrossRoundCoachingSummary(rounds: CoachingRound[]): CoachingSummary {
  const normalized = rounds
    .filter((round) => Number.isFinite(round.round))
    .map((round) => ({
      round: round.round,
      score: clampScore(round.score),
      attempts: round.attempts,
    }))
    .sort((a, b) => a.round - b.round);

  if (normalized.length === 0) {
    return {
      headline: "Cross-Round Coaching",
      overview: "No round data was recorded yet.",
      bullets: ["Complete at least one round to see a coaching summary."],
    };
  }

  const total = normalized.reduce((sum, round) => sum + round.score, 0);
  const average = total / normalized.length;
  const strongest = normalized.reduce((best, round) => (round.score > best.score ? round : best), normalized[0]);
  const weakest = normalized.reduce((worst, round) => (round.score < worst.score ? round : worst), normalized[0]);
  const spread = strongest.score - weakest.score;
  const strongRounds = normalized.filter((round) => round.score >= 0.75);
  const weakRounds = normalized.filter((round) => round.score < 0.6);

  const averageLine = `Across ${normalized.length} rounds, you averaged ${roundPct(average)}%.`;
  const strongestLine = `Your strongest round was ${formatRoundLabel(strongest.round)} at ${roundPct(strongest.score)}%.`;
  const weakestLine = `The clearest gap was ${formatRoundLabel(weakest.round)} at ${roundPct(weakest.score)}%.`;
  const consistencyLine =
    spread >= 0.3
      ? "That spread shows the main opportunity is consistency, not just isolated round fixes."
      : "Your results are fairly consistent, so the next jump comes from tightening the weaker rounds.";

  const overview = [
    averageLine,
    strongestLine,
    weakestLine,
    buildWeaknessTheme(weakRounds),
    buildStrengthTheme(strongRounds),
    buildAttemptTheme(normalized),
    consistencyLine,
  ].join(" ");

  const bullets = [
    buildStrengthTheme(strongRounds),
    buildWeaknessTheme(weakRounds),
    `Next step: carry the same level of control into ${formatRoundLabel(weakest.round)} and any other low-scoring rounds.`,
  ];

  return {
    headline: "Cross-Round Coaching",
    overview,
    bullets,
  };
}
