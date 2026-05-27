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

export type RoundContext = {
  instruction?: string | null;
  input?: string | null;
  expectedOutput?: string | null;
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

function buildContextBlock(ctx: RoundContext | undefined): string {
  if (!ctx) return "";
  const lines: string[] = [];
  if (ctx.instruction) lines.push(`Round instruction: ${truncate(ctx.instruction, 600)}`);
  if (ctx.input) lines.push(`Input/data the player was given: ${truncate(ctx.input, 800)}`);
  if (ctx.expectedOutput) lines.push(`Expected output pattern: ${truncate(ctx.expectedOutput, 600)}`);
  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

async function generateSingleTip(r: RoundForTip, ctx?: RoundContext): Promise<string | null> {
  const label = ROUND_TYPE_LABELS[r.round] ?? `Round ${r.round}`;
  const pct = Math.round(r.score * 100);
  const promptText = truncate(formatPrompt(r.prompt), 1200);
  const outputText = r.output ? truncate(r.output, 800) : null;
  const contextBlock = buildContextBlock(ctx);

  const instruction =
    r.round === 1
      ? `The player assembled this prompt by selecting preset prompt-engineering techniques (such as Role prompting, Chain-of-thought, Few-shot examples, etc.) for each section.

For each section of the prompt:
1. Identify the technique the player chose and explain in plain terms what that technique does.
2. State whether it was the right choice for that section and why — or, if wrong, what the correct technique should have been and why it fits better.

Then, as a separate closing section:
3. Present the ideal correct combination and order of techniques for this prompt. Explain why that specific sequence is the most effective and optimized approach — what each technique contributes, why their ordering matters, and how they build on each other to produce the best possible output.`
      : r.round === 5
        ? `This round is a logic / constraint puzzle. Be rigorous — verify correctness, not just keywords. Based on the puzzle (input), the player's prompt, and the AI's output:

1. Goal coherence — Check whether the goal stated or implied by the prompt is logically achievable given the puzzle's stated constraints. If the goal is impossible (e.g. asking for 4 liters in a 3-liter bucket, asking for a state that exceeds a container's capacity, requiring two contradictory conditions at once), call this out explicitly as the primary failure reason. Name the exact contradiction and explain why it cannot be satisfied.

2. Output correctness — Simulate the output's steps from the initial state and verify whether the final state actually satisfies the puzzle's goal. If the output mentions the goal but never actually reaches it, say so. If any step is illegal under the puzzle's rules (e.g. uses an operation the puzzle does not allow, exceeds capacity, miscounts state), point out the specific step that breaks.

3. Prompt quality — Reference the round's instruction and input directly. Identify which of these the prompt is missing: step-by-step instruction, constraint identification, role/persona, clearly labeled final answer, grounding ("do not invent moves").

4. Rewrite — Show concretely how the prompt should be rewritten: corrected goal statement, explicit step-by-step instruction, instruction to identify constraints first, labeled final answer, role/persona. Provide a one-paragraph example rewrite.`
        : `Based on the round's task, the player's exact prompt, and the AI output it produced:
1. Explain specifically why this prompt failed or would not produce the correct output — reference the round's instruction and input directly.
2. Describe concretely how the prompt should be rewritten or extended to achieve a higher score.`;

  const userContent = [
    contextBlock,
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
            "You are a prompt engineering coach reviewing a competition submission. Be specific and direct. Explain exactly why the prompt failed or fell short given the task's requirements — reference the instruction and input when relevant. Do not start sentences with 'Your prompt' or 'The prompt'. Use plain language.",
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
  attempts: RoundForTip[],
  ctx?: RoundContext
): Promise<string | null> {
  const label = ROUND_TYPE_LABELS[roundNum] ?? `Round ${roundNum}`;
  const finalPct = Math.round(attempts[attempts.length - 1].score * 100);
  const contextBlock = buildContextBlock(ctx);

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
            "You are a prompt engineering coach reviewing multiple attempts at a competition challenge. Be specific and direct. Explain why each prompt failed given the task's requirements — reference the instruction and input when relevant. Do not start sentences with 'Your prompt' or 'The prompt'. Use plain language.",
        },
        {
          role: "user",
          content: [
            contextBlock,
            `Round: ${label}`,
            `Total Attempts: ${attempts.length}`,
            `Final Score: ${finalPct}%`,
            "",
            "All attempts in order:",
            attemptsText,
            "",
            ...(roundNum === 5
              ? [
                  "This round is a logic / constraint puzzle. Be rigorous — verify correctness, not just keywords. Across all attempts:",
                  "1. For each attempt, check whether the prompt's goal is logically achievable given the puzzle's constraints. If the goal is impossible (e.g. asking for 4 liters in a 3-liter bucket, requiring a state that exceeds a container's capacity, or asking for two contradictory conditions at once), name this as the primary failure reason and explain the exact contradiction.",
                  "2. For each attempt, simulate the output's steps from the initial state and verify whether the final state actually satisfies the goal. If the output mentions the goal but never reaches it, say so. If any step is illegal under the puzzle's rules, point out the specific step that breaks.",
                  "3. Identify what improved between attempts (corrected goal, better structure, clearer constraints, role assignment).",
                  "4. Explain what in the final prompt still limits the score and provide a concrete one-paragraph rewrite — corrected goal statement, explicit step-by-step instruction, identify constraints first, labeled final answer, role/persona.",
                ]
              : [
                  "Based on the round's task and the progression across all attempts:",
                  "1. For each attempt, explain specifically why that prompt failed or fell short — reference the instruction and input directly.",
                  "2. Identify what improved between attempts and what the player figured out along the way.",
                  "3. Explain what in the final prompt still limited the score, and describe concretely what changes would push the score higher.",
                ]),
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
  rounds: RoundForTip[],
  roundContexts: Record<number, RoundContext> = {}
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
      const ctx = roundContexts[roundNum];

      // Round 1, single attempt — got it right first try, no tip needed
      if (roundNum === 1 && sorted.length === 1) return null;

      // Round 1, multiple attempts — tip based on the worst attempt
      if (roundNum === 1) {
        const worst = sorted.reduce((w, r) => r.score < w.score ? r : w, sorted[0]);
        const tip = await generateSingleTip(worst, ctx);
        return tip !== null ? ([roundNum, tip] as const) : null;
      }

      // Other rounds, single attempt
      if (sorted.length === 1) {
        const tip = await generateSingleTip(sorted[0], ctx);
        return tip !== null ? ([roundNum, tip] as const) : null;
      }

      // Other rounds, multiple attempts — consolidated tip covering all attempts
      const tip = await generateMultiAttemptTip(roundNum, sorted, ctx);
      return tip !== null ? ([roundNum, tip] as const) : null;
    })
  );

  return Object.fromEntries(entries.filter((e): e is [number, string] => e !== null));
}
