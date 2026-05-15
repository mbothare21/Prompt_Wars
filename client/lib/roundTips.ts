import "server-only";

import { getOpenAI } from "./openai";

const ROUND_TYPE_LABELS: Record<number, string> = {
  1: "Signal Scan",
  2: "Prompt Refinery",
  3: "Backtrace",
  4: "Compression Chamber",
  5: "Protocol Stack",
  6: "Prompt Forge",
};

const FALLBACK_TIPS: Record<string, string> = {
  "Signal Scan": "Focus on specific classification boundaries — avoid broad generalisations.",
  "Prompt Refinery": "Add explicit constraints and clear structure to guide the model.",
  "Backtrace": "Work backwards from the expected output to find key prompt patterns.",
  "Compression Chamber": "Prioritise information density — strip all redundant words.",
  "Protocol Stack": "Follow every format requirement exactly as specified.",
  "Prompt Forge": "Combine specificity, format, and constraints in one tight prompt.",
};

export type RoundForTip = {
  round: number;
  score: number;
  attempts: number;
  prompt: unknown;
  output?: string;
};

function formatPrompt(prompt: unknown): string {
  if (typeof prompt === "string") return prompt.trim();
  if (prompt && typeof prompt === "object") {
    return Object.entries(prompt as Record<string, string>)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n")
      .trim();
  }
  return "N/A";
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

async function generateSingleTip(r: RoundForTip): Promise<string | null> {
  const label = ROUND_TYPE_LABELS[r.round] ?? `Round ${r.round}`;
  const pct = Math.round(r.score * 100);
  const promptText = truncate(formatPrompt(r.prompt), 1200);
  const outputText = r.output ? truncate(r.output, 800) : null;

  const instruction =
    r.round === 1
      ? `The player assembled this prompt by selecting preset prompt-engineering techniques (such as Role prompting, Chain-of-thought, Few-shot examples, etc.).

For each technique present in the player's prompt:
1. Explain what that technique means in plain terms.
2. Explain whether it was the right choice for that specific section of the prompt and why.

Also highlight any techniques that were incorrect or missing and what should have been chosen instead.`
      : `Based on the player's exact prompt and the AI output it produced:
1. Explain specifically what in the prompt caused the score to fall short of 100%.
2. Describe concretely how the prompt should be rewritten or extended to achieve a higher score.`;

  const userContent = [
    `Round: ${label}`,
    `Score: ${pct}%`,
    `Attempts: ${r.attempts}`,
    "",
    "Player's prompt:",
    promptText,
    outputText ? `\nAI output:\n${outputText}` : "",
    "",
    instruction,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const openai = getOpenAI();
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a prompt engineering coach reviewing a competition submission. Be specific and direct. Do not start sentences with 'Your prompt' or 'The prompt'. Use plain language.",
        },
        { role: "user", content: userContent },
      ],
      temperature: 0.5,
    });
    const tip = res.choices[0]?.message?.content?.trim();
    if (tip && tip.length > 0) return tip;
    return FALLBACK_TIPS[label] ?? "Review the round instructions carefully.";
  } catch {
    return FALLBACK_TIPS[label] ?? "Review the round instructions carefully.";
  }
}

async function generateMultiAttemptTip(
  roundNum: number,
  attempts: RoundForTip[]
): Promise<string | null> {
  const label = ROUND_TYPE_LABELS[roundNum] ?? `Round ${roundNum}`;
  const finalPct = Math.round(attempts[attempts.length - 1].score * 100);

  const attemptsText = attempts
    .map((r, i) => {
      const pct = Math.round(r.score * 100);
      const promptText = truncate(formatPrompt(r.prompt), 600);
      const outputText = r.output ? truncate(r.output, 300) : null;
      return [
        `Attempt ${i + 1} — Score: ${pct}%`,
        `Prompt: ${promptText}`,
        outputText ? `Output: ${outputText}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n---\n\n");

  try {
    const openai = getOpenAI();
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a prompt engineering coach reviewing multiple attempts at a competition challenge. Be specific and direct. Do not start sentences with 'Your prompt' or 'The prompt'. Use plain language.",
        },
        {
          role: "user",
          content: [
            `Round: ${label}`,
            `Total Attempts: ${attempts.length}`,
            `Final Score: ${finalPct}%`,
            "",
            "All attempts in order:",
            attemptsText,
            "",
            "Based on the progression across all attempts:",
            "1. Identify what improved between attempts and what the player figured out along the way.",
            "2. Explain what in the final prompt still limited the score below 100%.",
            "3. Describe concretely what changes would push the score higher on the next try.",
          ].join("\n"),
        },
      ],
      temperature: 0.5,
    });
    const tip = res.choices[0]?.message?.content?.trim();
    if (tip && tip.length > 0) return tip;
    return FALLBACK_TIPS[label] ?? "Review the round instructions carefully.";
  } catch {
    return FALLBACK_TIPS[label] ?? "Review the round instructions carefully.";
  }
}

export async function generateRoundTips(
  rounds: RoundForTip[]
): Promise<Record<number, string>> {
  // Group all attempt records by round number, sort each group by attempt count
  const byRound = new Map<number, RoundForTip[]>();
  for (const r of rounds) {
    const group = byRound.get(r.round) ?? [];
    group.push(r);
    byRound.set(r.round, group);
  }

  const entries = await Promise.all(
    Array.from(byRound.entries()).map(async ([roundNum, attempts]) => {
      const sorted = [...attempts].sort((a, b) => (a.attempts ?? 0) - (b.attempts ?? 0));

      // Round 1, single attempt — got it right first try, no tip needed
      if (roundNum === 1 && sorted.length === 1) return null;

      // Round 1, multiple attempts — tip based on the worst attempt
      if (roundNum === 1) {
        const worst = sorted.reduce((w, r) => r.score < w.score ? r : w, sorted[0]);
        const tip = await generateSingleTip(worst);
        return tip !== null ? ([roundNum, tip] as const) : null;
      }

      // Other rounds, single attempt
      if (sorted.length === 1) {
        const tip = await generateSingleTip(sorted[0]);
        return tip !== null ? ([roundNum, tip] as const) : null;
      }

      // Other rounds, multiple attempts — consolidated tip covering all attempts
      const tip = await generateMultiAttemptTip(roundNum, sorted);
      return tip !== null ? ([roundNum, tip] as const) : null;
    })
  );

  return Object.fromEntries(entries.filter((e): e is [number, string] => e !== null));
}
