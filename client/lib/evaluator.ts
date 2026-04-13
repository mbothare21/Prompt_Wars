import { getOpenAI } from "./openai";
import { getSimilarity } from "./similarity";
import type { Round } from "./types";
import { cacheKey, cacheGet, cacheSet } from "./cache";

// ── Types ─────────────────────────────────────────────────────────────────────

type ObjectConstraints = {
  maxWords?: number;
  requiredSections?: string[];
  requireSteps?: boolean;
  mustInclude?: string[];
  mustExclude?: string[];
};

type CombinedScores = { quality: number; analogy: number; prompt: number };

// ── LLM timeout wrapper ───────────────────────────────────────────────────────

async function callLLM<T>(promise: Promise<T>, ms = 3000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("LLM Timeout")), ms)
    ),
  ]);
}

// ── Heuristics (no LLM) ───────────────────────────────────────────────────────

function clamp(n: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

const PROMPT_CONSTRAINT_WORDS =
  /\b(must|should|only|exactly|format|structure|include|exclude|limit|max|minimum|step|json|xml|list|table|brief|detailed|concise)\b/i;
const PROMPT_ACTION_WORDS =
  /\b(explain|describe|write|analyze|summarize|list|compare|generate|extract|identify|classify|convert|translate|create|output)\b/i;

function scorePrompt(prompt: string): number {
  const words = prompt.trim().split(/\s+/).filter(Boolean);
  const len = words.length;
  if (len === 0) return 0;

  let score = 0;
  if (len >= 5 && len <= 60) score += 0.4;
  else if (len > 0 && len < 5) score += 0.1;
  else score += 0.2;

  if (PROMPT_CONSTRAINT_WORDS.test(prompt)) score += 0.3;
  if (PROMPT_ACTION_WORDS.test(prompt)) score += 0.3;

  return Math.min(1, score);
}

const ANALOGY_MARKERS =
  /\b(like|similar to|just as|think of|imagine|as if|metaphor|analogy|resembles|compared to|in the same way|picture|envision)\b/i;

function scoreAnalogy(output: string): number {
  const words = output.trim().split(/\s+/).filter(Boolean).length;
  if (words < 10) return 0.1;
  const lengthBonus = Math.min(0.3, words / 80);
  return ANALOGY_MARKERS.test(output) ? 0.7 + lengthBonus : 0.1 + lengthBonus;
}

const REASONING_CONNECTORS =
  /\b(because|therefore|thus|hence|since|given that|as a result|consequently|first|second|third|finally|in conclusion|step \d)\b/i;

function scoreReasoning(output: string): number {
  const words = output.trim().split(/\s+/).filter(Boolean).length;
  if (words < 10) return 0;
  let score = 0;
  if (REASONING_CONNECTORS.test(output)) score += 0.4;
  if (/\b\d+\.|\b[a-z]\)/.test(output)) score += 0.3;
  if (words >= 30) score += 0.3;
  return Math.min(1, score);
}

// ── Combined LLM scorer (1 call instead of 3) ─────────────────────────────────

async function scoreCombined(
  userPrompt: string,
  output: string
): Promise<CombinedScores> {
  const key = cacheKey("combined", userPrompt, output);
  const cached = cacheGet<CombinedScores>(key);
  if (cached) return cached;

  try {
    const res = await callLLM(
      getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a scoring engine.

Return JSON only — no markdown, no explanation:
{
  "quality": number,
  "analogy": number,
  "prompt": number
}
Score each from 0 to 1.`,
          },
          {
            role: "user",
            content: `Prompt:\n${userPrompt}\n\nOutput:\n${output}`,
          },
        ],
        response_format: { type: "json_object" },
      })
    );

    const text = res.choices[0].message.content?.trim() ?? "{}";
    const parsed = JSON.parse(text) as Partial<CombinedScores>;
    const scores: CombinedScores = {
      quality: clamp(Number(parsed.quality)),
      analogy: clamp(Number(parsed.analogy)),
      prompt: clamp(Number(parsed.prompt)),
    };
    cacheSet(key, scores);
    return scores;
  } catch {
    // Fallback to heuristics on LLM timeout or parse error
    return {
      quality: 0.5,
      analogy: scoreAnalogy(output),
      prompt: scorePrompt(userPrompt),
    };
  }
}

// ── Constraint checker ────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkConstraints(
  constraints: unknown,
  _userPrompt: string,
  output: string
): number {
  if (constraints == null) return 1;

  if (Array.isArray(constraints)) {
    if (constraints.length === 0) return 1;
    let met = 0;
    for (const item of constraints) {
      if (
        typeof item === "string" &&
        output.toLowerCase().includes(item.toLowerCase())
      )
        met++;
    }
    return met / constraints.length;
  }

  if (!isPlainObject(constraints)) return 1;

  const c = constraints as ObjectConstraints;
  let score = 0;
  let total = 0;

  if (c.maxWords != null) {
    total++;
    if (output.split(/\s+/).filter(Boolean).length <= c.maxWords) score++;
  }
  if (c.requiredSections?.length) {
    total++;
    if (c.requiredSections.every((s) => output.includes(s))) score++;
  }
  if (c.requireSteps) {
    total++;
    if (
      /step/i.test(output) ||
      /\b1\.|\b2\./.test(output) ||
      /first/i.test(output)
    )
      score++;
  }
  if (c.mustInclude?.length) {
    total++;
    if (c.mustInclude.every((w) => output.toLowerCase().includes(w.toLowerCase())))
      score++;
  }
  if (c.mustExclude?.length) {
    total++;
    if (!c.mustExclude.some((w) => output.toLowerCase().includes(w.toLowerCase())))
      score++;
  }

  return total === 0 ? 1 : score / total;
}

// ── Structure heuristics ──────────────────────────────────────────────────────

function getBrevityScore(prompt: string): number {
  const words = prompt.trim().split(/\s+/).filter(Boolean).length;
  if (words > 15) return 0;
  return 1 - (words / 15) * 0.5;
}

function evaluateConstraints(output: string): number {
  let score = 0;
  let total = 0;

  total++;
  const wordCount = output.split(/\s+/).filter(Boolean).length;
  if (wordCount > 0 && wordCount <= 500) score++;

  total++;
  if (
    /[-*]\s+/.test(output) ||
    /\b\d+\./.test(output) ||
    /^#{1,6}\s+/m.test(output)
  )
    score++;

  total++;
  if (wordCount >= 20) score++;

  return total === 0 ? 1 : score / total;
}

function evaluateStructure(output: string): number {
  const bullets = (output.match(/[-*]\s+/g) || []).length;
  const numbered = (output.match(/\b\d+\./g) || []).length;
  const headings = (output.match(/^#{1,6}\s+/gm) || []).length;
  const paragraphs = output
    .split(/\n\n+/)
    .filter((p) => p.trim().length > 0).length;
  return Math.min(
    1,
    (bullets * 0.2 + numbered * 0.3 + headings * 0.3 + paragraphs * 0.2) / 4
  );
}

// ── Per-round evaluators ──────────────────────────────────────────────────────

async function evaluateOptimizeRound(userPrompt: string) {
  const brevityScore = getBrevityScore(userPrompt);
  if (brevityScore === 0) {
    return { finalScore: 0, progress: 0, reason: "Prompt exceeds 15 words" };
  }

  const completion = await callLLM(
    getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: userPrompt }],
    })
  );

  const output = completion.choices[0].message.content || "";
  const { analogy: analogyQualityScore, prompt: promptScore } =
    await scoreCombined(userPrompt, output);

  const finalScore =
    0.4 * brevityScore + 0.4 * analogyQualityScore + 0.2 * promptScore;
  return {
    output,
    brevityScore,
    analogyQualityScore,
    promptScore,
    finalScore,
    progress: Math.round(finalScore * 100),
  };
}

function evaluateClassifyRound(
  round: Round,
  answers: Record<string, string>
) {
  const parts = round.promptParts ?? [];
  if (parts.length === 0) {
    return { correct: 0, total: 0, finalScore: 0, progress: 0 };
  }

  let correct = 0;
  for (const part of parts) {
    if (answers[part.id] === part.answer) correct++;
  }

  const score = correct / parts.length;
  return {
    correct,
    total: parts.length,
    finalScore: score,
    progress: Math.round(score * 100),
  };
}

async function evaluateImproveRound(round: Round, userPrompt: string) {
  const initial = round.originalPrompt || round.input || "";

  const completion = await callLLM(
    getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `${initial}\n\nImprove this explanation:\n${userPrompt}`,
        },
      ],
    })
  );

  const output = completion.choices[0].message.content || "";
  const {
    quality: qualityScore,
    analogy: analogyScore,
    prompt: promptScore,
  } = await scoreCombined(userPrompt, output);
  const constraintScore = checkConstraints(round.constraints, userPrompt, output);

  const finalScore =
    0.4 * qualityScore +
    0.2 * analogyScore +
    0.2 * promptScore +
    0.2 * constraintScore;
  return {
    output,
    qualityScore,
    analogyScore,
    promptScore,
    constraintScore,
    finalScore,
    progress: Math.round(finalScore * 100),
  };
}

async function evaluateReverseRound(round: Round, userPrompt: string) {
  const target = round.expectedOutput || "";

  const [sim, qualityScore] = await Promise.all([
    getSimilarity(userPrompt, target),
    Promise.resolve(scorePrompt(userPrompt)), // heuristic — no LLM call needed
  ]);

  const constraintScore = checkConstraints(round.constraints, userPrompt, target);
  const finalScore = 0.5 * sim + 0.3 * qualityScore + 0.2 * constraintScore;
  return {
    recoveredPrompt: userPrompt,
    similarity: sim,
    qualityScore,
    constraintScore,
    finalScore,
    progress: Math.round(finalScore * 100),
  };
}

async function evaluateStructuredRound(userPrompt: string) {
  const completion = await callLLM(
    getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: userPrompt }],
    })
  );

  const output = completion.choices[0].message.content || "";
  // All three scores are heuristics — no extra LLM calls
  const reasoningScore = scoreReasoning(output);
  const structureScore = evaluateStructure(output);
  const promptScore = scorePrompt(userPrompt);

  const finalScore =
    0.4 * reasoningScore + 0.3 * structureScore + 0.3 * promptScore;
  return {
    output,
    reasoningScore,
    structureScore,
    promptScore,
    finalScore,
    progress: Math.round(finalScore * 100),
  };
}

async function judgePersuasion(output: string): Promise<number> {
  const key = cacheKey("persuasion", output);
  const cached = cacheGet<number>(key);
  if (cached !== undefined) return cached;

  try {
    const res = await callLLM(
      getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You evaluate persuasive writing." },
          {
            role: "user",
            content: `Evaluate this text for persuasiveness:

${output}

Score from 0 to 1 based on:
- Clarity of argument
- Use of evidence or examples
- Logical flow and coherence
- Compelling language

Only return a number.`,
          },
        ],
      })
    );

    const text = res.choices[0].message.content?.trim() ?? "0";
    const n = parseFloat(text);
    const score = clamp(Number.isFinite(n) ? n : 0);
    cacheSet(key, score);
    return score;
  } catch {
    return 0.5;
  }
}

export async function evaluateMetaBonusRound({
  metaPrompt,
  finalPrompt,
  basePrompt,
  targetOutput,
}: {
  metaPrompt: string;
  finalPrompt: string;
  basePrompt: string;
  targetOutput: string;
}) {
  try {
    if (!metaPrompt || !finalPrompt) {
      return {
        finalScore: 0,
        progress: 0,
        error: "Both metaPrompt and finalPrompt are required",
      };
    }

    // Run both generation calls in parallel
    const [improvedPromptRes, finalOutputRes] = await Promise.all([
      callLLM(
        getOpenAI().chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: `${metaPrompt}\n\nBase Prompt:\n${basePrompt}`,
            },
          ],
        })
      ),
      callLLM(
        getOpenAI().chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: finalPrompt }],
        })
      ),
    ]);

    const improvedPrompt =
      improvedPromptRes.choices[0].message.content || "";
    const finalOutput = finalOutputRes.choices[0].message.content || "";

    const constraintScore = evaluateConstraints(finalOutput);
    const structureScore = evaluateStructure(finalOutput);

    // Parallel: LLM-backed persuasion + similarity; heuristic prompt scores
    const [persuasionScore, similarityScore] = await Promise.all([
      judgePersuasion(finalOutput),
      getSimilarity(finalOutput, targetOutput),
    ]);

    const promptScore = scorePrompt(finalPrompt);
    const metaPromptScore = scorePrompt(metaPrompt);

    const finalScore =
      0.3 * constraintScore +
      0.2 * structureScore +
      0.2 * persuasionScore +
      0.15 * similarityScore +
      0.1 * promptScore +
      0.05 * metaPromptScore;

    return {
      improvedPrompt,
      finalOutput,
      scores: {
        constraintScore,
        structureScore,
        persuasionScore,
        similarityScore,
        promptScore,
        metaPromptScore,
      },
      finalScore,
      progress: Math.round(finalScore * 100),
    };
  } catch (err) {
    console.error("Meta Bonus Evaluation Error:", err);
    return { finalScore: 0, progress: 0, error: "Evaluation failed" };
  }
}

export async function evaluateRound(
  round: Round,
  userPrompt: string,
  answers?: Record<string, string>
) {
  switch (round.type) {
    case "IMPROVE":
      return evaluateImproveRound(round, userPrompt);
    case "REVERSE":
      return evaluateReverseRound(round, userPrompt);
    case "OPTIMIZE":
      return evaluateOptimizeRound(userPrompt);
    case "STRUCTURED":
      return evaluateStructuredRound(userPrompt);
    case "CLASSIFY":
      return evaluateClassifyRound(round, answers ?? {});
    default:
      throw new Error("Unknown round type");
  }
}
