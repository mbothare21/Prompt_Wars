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
  // Round 1 with a single attempt — player got it right first try, no tip needed
  if (r.round === 1 && r.attempts <= 1) return null;

  const label = ROUND_TYPE_LABELS[r.round] ?? `Round ${r.round}`;
  const pct = Math.round(r.score * 100);
  const promptText = truncate(formatPrompt(r.prompt), 1200);
  const outputText = r.output ? truncate(r.output, 800) : null;

  // Round 1 (Signal Scan) — player assembled a prompt from preset techniques.
  // Explain what each technique means and whether it was the right choice.
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
    return r.round === 1 ? null : (FALLBACK_TIPS[label] ?? "Review the round instructions carefully.");
  } catch {
    return r.round === 1 ? null : (FALLBACK_TIPS[label] ?? "Review the round instructions carefully.");
  }
}

export async function generateRoundTips(
  rounds: RoundForTip[]
): Promise<Record<number, string>> {
  const entries = await Promise.all(
    rounds.map(async (r) => {
      const tip = await generateSingleTip(r);
      return tip !== null ? ([r.round, tip] as const) : null;
    })
  );
  return Object.fromEntries(entries.filter((e): e is [number, string] => e !== null));
}
