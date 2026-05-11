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

async function generateSingleTip(r: RoundForTip): Promise<string> {
  const label = ROUND_TYPE_LABELS[r.round] ?? `Round ${r.round}`;
  const pct = Math.round(r.score * 100);
  const promptText = truncate(formatPrompt(r.prompt), 800);
  const outputText = r.output ? truncate(r.output, 600) : null;

  const userContent = [
    `Round type: ${label}`,
    `Score achieved: ${pct}%`,
    `Attempts used: ${r.attempts}`,
    ``,
    `Player's prompt:`,
    promptText,
    outputText ? `\nAI output produced:\n${outputText}` : "",
    ``,
    `Give a specific, actionable improvement tip for this exact submission. Explain what in the player's prompt caused the score and what they should change next time. Be as detailed as needed.`,
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
            "You are a prompt engineering coach reviewing competition submissions. Be specific and direct. Do not repeat the round type name. Do not start with 'Your prompt' or 'The prompt'.",
        },
        { role: "user", content: userContent },
      ],
      temperature: 0.5,
    });
    const tip = res.choices[0]?.message?.content?.trim();
    return tip && tip.length > 0 ? tip : FALLBACK_TIPS[label] ?? "Review the round instructions carefully.";
  } catch {
    return FALLBACK_TIPS[label] ?? "Review the round instructions carefully.";
  }
}

export async function generateRoundTips(
  rounds: RoundForTip[]
): Promise<Record<number, string>> {
  const entries = await Promise.all(
    rounds.map(async (r) => [r.round, await generateSingleTip(r)] as const)
  );
  return Object.fromEntries(entries);
}
