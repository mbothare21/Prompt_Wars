import "server-only";

import { getOpenAI } from "./openai";
import { getSimilarity } from "./similarity";
import type { Round, BonusCheck, BonusEvalConfig } from "./types";
import { cacheKey, cacheGet, cacheSet } from "./cache";

function getTimeoutMs(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const LLM_TIMEOUT_MS = getTimeoutMs(
  process.env.EVALUATOR_LLM_TIMEOUT_MS ?? process.env.OPENAI_TIMEOUT_MS,
  12_000
);

// ── Types ─────────────────────────────────────────────────────────────────────

type ObjectConstraints = {
  maxWords?: number;
  requiredSections?: string[];
  requireSteps?: boolean;
  mustInclude?: string[];
  mustExclude?: string[];
};

type CombinedScores = { quality: number; analogy: number; prompt: number };
type BaselineRoundType = "IMPROVE" | "REVERSE" | "OPTIMIZE" | "STRUCTURED" | "BONUS";
type BaselineGate = {
  baselineGateScore: number;
  baselineScore: number;
  thresholdScore: number;
  beatBaseline: boolean;
  margin: number;
};

const EXECUTION_SYSTEM_PROMPT =
  "You are being evaluated in a prompt-engineering competition. Follow only the user's prompt and the provided input. Do not add sections, constraints, formatting, assumptions, or helpful structure unless they are explicitly requested. If the prompt is underspecified, respond conservatively rather than filling in missing requirements.";

const BASELINE_MARGIN_BY_TYPE: Record<BaselineRoundType, number> = {
  IMPROVE: 0.06,
  REVERSE: 0.08,
  OPTIMIZE: 0.05,
  STRUCTURED: 0.06,
  BONUS: 0.08,
};


// ── LLM timeout wrapper ───────────────────────────────────────────────────────

async function callLLM<T>(promise: Promise<T>, ms = LLM_TIMEOUT_MS): Promise<T> {
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

function scoreChecks(text: string, checks: BonusCheck[]): number {
  const normalized = text.trim();
  if (!normalized) return 0;

  let matched = 0;
  for (const check of checks) {
    if (check.test(normalized)) matched++;
  }

  return checks.length === 0 ? 1 : matched / checks.length;
}

function countNamedSections(text: string, sections: string[]): number {
  const normalized = text.toLowerCase();
  return sections.filter((s) => normalized.includes(s.toLowerCase())).length;
}

function scoreNamedSections(text: string, sections: string[]): number {
  return sections.length === 0 ? 1 : countNamedSections(text, sections) / sections.length;
}

async function getOrComputeCached<T>(
  key: string,
  compute: () => Promise<T>
): Promise<T> {
  const cached = cacheGet<T>(key);
  if (cached !== undefined) return cached;
  const value = await compute();
  cacheSet(key, value);
  return value;
}

function getBaselineMargin(type: BaselineRoundType): number {
  return BASELINE_MARGIN_BY_TYPE[type];
}

function scoreBaselineGate(
  candidateScore: number,
  baselineScore: number,
  type: BaselineRoundType
): BaselineGate {
  const margin = getBaselineMargin(type);
  const thresholdScore = Math.min(0.98, baselineScore + margin);

  if (candidateScore >= thresholdScore) {
    return {
      baselineGateScore: 1,
      baselineScore,
      thresholdScore,
      beatBaseline: true,
      margin,
    };
  }

  return {
    baselineGateScore:
      clamp(candidateScore / Math.max(thresholdScore, 1e-6)) * 0.35,
    baselineScore,
    thresholdScore,
    beatBaseline: false,
    margin,
  };
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
        temperature: 0,
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
    const normalizedOutput = output.toLowerCase();
    if (c.requiredSections.every((s) => normalizedOutput.includes(s.toLowerCase()))) score++;
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

async function runPromptWithContext(
  prompt: string,
  input?: string,
  inputLabel = "Input"
) {
  const content = input?.trim()
    ? `${prompt}\n\n${inputLabel}:\n${input}`
    : prompt;

  const completion = await callLLM(
    getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: EXECUTION_SYSTEM_PROMPT },
        { role: "user", content },
      ],
    })
  );

  return completion.choices[0].message.content || "";
}

// ── Per-round evaluators ──────────────────────────────────────────────────────

async function evaluateOptimizeRound(round: Round, userPrompt: string) {
  const brevityScore = getBrevityScore(userPrompt);
  if (brevityScore === 0) {
    return { finalScore: 0, progress: 0, reason: "Prompt exceeds 15 words" };
  }

  const output = await runPromptWithContext(userPrompt, round.input, "Task");
  const scored = await scoreOptimizeOutcome(
    round,
    userPrompt,
    output
  );
  const baseline = await getOptimizeBaseline(round);
  const baselineGate = scoreBaselineGate(
    scored.taskOutputScore,
    baseline.baselineScore,
    "OPTIMIZE"
  );
  const finalScore =
    0.4 * scored.taskOutputScore +
    0.3 * scored.promptCraftScore +
    0.3 * baselineGate.baselineGateScore;
  return {
    output,
    ...scored,
    ...baselineGate,
    baselinePrompt: baseline.baselinePrompt,
    baselineOutput: baseline.baselineOutput,
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

function getImproveBaselinePrompt(round: Round): string {
  return (
    round.originalPrompt?.trim() ||
    "Extract the key business insights from the following content. Identify conflicts between stakeholders, decisions made, dependencies that are blocking progress, risks, and immediate next steps. Structure the output clearly with each category labeled."
  );
}

function getReverseBaselinePrompt(round: Round): string {
  const example = round.expectedOutput?.trim();
  return example
    ? `Study the structured output below carefully. Write a precise prompt that would reliably generate content in exactly the same format and structure as the example, covering all the same sections.\n\nExample:\n${example}`
    : "Write a structured startup idea.";
}

function getOptimizeBaselinePrompt(round: Round): string {
  return round.input?.trim() || "Explain this simply using an analogy.";
}

function getStructuredBaselinePrompt(): string {
  return "Think through this problem step by step. Identify all constraints and rules first, then work through each step systematically, showing your reasoning at each stage. State your final answer clearly.";
}


async function scoreImproveOutcome(
  round: Round,
  prompt: string,
  output: string
) {
  const { quality: qualityScore, prompt: promptScore } = await scoreCombined(
    prompt,
    output
  );
  const constraintScore = checkConstraints(round.constraints, prompt, output);
  const similarityScore = round.expectedOutput
    ? await getSimilarity(output, round.expectedOutput)
    : 1;
  const taskOutputScore =
    0.45 * qualityScore +
    0.3 * similarityScore +
    0.25 * constraintScore;

  return {
    qualityScore,
    similarityScore,
    promptScore,
    constraintScore,
    taskOutputScore,
  };
}

async function scoreReverseOutcome(
  round: Round,
  prompt: string,
  output: string
) {
  const target = round.expectedOutput || "";
  const [similarity, promptScore] = await Promise.all([
    getSimilarity(output, target),
    Promise.resolve(scorePrompt(prompt)),
  ]);
  const constraintScore = checkConstraints(round.constraints, prompt, output);
  const taskOutputScore = 0.8 * similarity + 0.2 * constraintScore;

  return {
    similarity,
    promptScore,
    constraintScore,
    taskOutputScore,
  };
}

async function scoreOptimizeOutcome(
  round: Round,
  prompt: string,
  output: string
) {
  const brevityScore = getBrevityScore(prompt);
  const {
    quality: qualityScore,
    analogy: analogyQualityScore,
    prompt: promptScore,
  } =
    await scoreCombined(prompt, output);
  const taskOutputScore =
    0.55 * qualityScore +
    0.45 * analogyQualityScore;
  const promptCraftScore = 0.6 * brevityScore + 0.4 * promptScore;

  return {
    brevityScore,
    qualityScore,
    analogyQualityScore,
    promptScore,
    promptCraftScore,
    taskOutputScore,
  };
}

async function scoreStructuredOutcome(
  round: Round,
  prompt: string,
  output: string
) {
  const reasoningScore = scoreReasoning(output);
  const structureScore = evaluateStructure(output);
  const promptScore = scorePrompt(prompt);
  const constraintScore = checkConstraints(round.constraints, prompt, output);
  const taskOutputScore =
    0.45 * reasoningScore +
    0.35 * structureScore +
    0.2 * constraintScore;

  return {
    reasoningScore,
    structureScore,
    promptScore,
    constraintScore,
    taskOutputScore,
  };
}

async function scoreBonusOutput(finalOutput: string, config: BonusEvalConfig) {
  const outputCoverageScore = scoreBonusOutputCoverage(finalOutput, config);
  const outputStructureScore = scoreBonusOutputStructure(finalOutput, config);
  const similarityScore = await getSimilarity(finalOutput, config.targetOutput);
  const taskOutputScore =
    0.5 * outputCoverageScore +
    0.3 * outputStructureScore +
    0.2 * similarityScore;

  return {
    outputCoverageScore,
    outputStructureScore,
    similarityScore,
    taskOutputScore,
  };
}

async function getImproveBaseline(round: Round) {
  const baselinePrompt = getImproveBaselinePrompt(round);
  return getOrComputeCached(
    cacheKey(
      "baseline",
      "IMPROVE",
      baselinePrompt,
      round.input ?? "",
      round.expectedOutput ?? ""
    ),
    async () => {
      const baselineOutput = await runPromptWithContext(
        baselinePrompt,
        round.input,
        "Source Text"
      );
      const scored = await scoreImproveOutcome(
        round,
        baselinePrompt,
        baselineOutput
      );
      return {
        baselinePrompt,
        baselineOutput,
        baselineScore: scored.taskOutputScore,
      };
    }
  );
}

async function getReverseBaseline(round: Round) {
  const baselinePrompt = getReverseBaselinePrompt(round);
  return getOrComputeCached(
    cacheKey(
      "baseline",
      "REVERSE",
      baselinePrompt,
      round.expectedOutput ?? ""
    ),
    async () => {
      const baselineOutput = await runPromptWithContext(baselinePrompt);
      const scored = await scoreReverseOutcome(
        round,
        baselinePrompt,
        baselineOutput
      );
      return {
        baselinePrompt,
        baselineOutput,
        baselineScore: scored.taskOutputScore,
      };
    }
  );
}

async function getOptimizeBaseline(round: Round) {
  const baselinePrompt = getOptimizeBaselinePrompt(round);
  return getOrComputeCached(
    cacheKey(
      "baseline",
      "OPTIMIZE",
      baselinePrompt,
      round.input ?? "",
      round.expectedOutput ?? ""
    ),
    async () => {
      const baselineOutput = await runPromptWithContext(
        baselinePrompt,
        round.input,
        "Task"
      );
      const scored = await scoreOptimizeOutcome(
        round,
        baselinePrompt,
        baselineOutput
      );
      return {
        baselinePrompt,
        baselineOutput,
        baselineScore: scored.taskOutputScore,
      };
    }
  );
}

async function getStructuredBaseline(round: Round) {
  const baselinePrompt = getStructuredBaselinePrompt();
  return getOrComputeCached(
    cacheKey(
      "baseline",
      "STRUCTURED",
      baselinePrompt,
      round.input ?? "",
      round.expectedOutput ?? ""
    ),
    async () => {
      const baselineOutput = await runPromptWithContext(
        baselinePrompt,
        round.input,
        "Problem"
      );
      const scored = await scoreStructuredOutcome(
        round,
        baselinePrompt,
        baselineOutput
      );
      return {
        baselinePrompt,
        baselineOutput,
        baselineScore: scored.taskOutputScore,
      };
    }
  );
}

async function getBonusBaseline(basePrompt: string, config: BonusEvalConfig) {
  return getOrComputeCached(
    cacheKey("baseline", "BONUS", config.baselineMetaPrompt, basePrompt),
    async () => {
      const baselineCompiledPrompt = await compileMetaPrompt({
        metaPrompt: config.baselineMetaPrompt,
        basePrompt,
      });
      const baselineOutput = await runPromptWithContext(
        baselineCompiledPrompt,
        basePrompt,
        "Scenario"
      );
      const scored = await scoreBonusOutput(baselineOutput, config);
      return {
        baselineMetaPrompt: config.baselineMetaPrompt,
        baselineCompiledPrompt,
        baselineOutput,
        baselineScore: scored.taskOutputScore,
      };
    }
  );
}

async function evaluateImproveRound(round: Round, userPrompt: string) {
  const output = await runPromptWithContext(userPrompt, round.input, "Source Text");
  const scored = await scoreImproveOutcome(
    round,
    userPrompt,
    output
  );
  const baseline = await getImproveBaseline(round);
  const baselineGate = scoreBaselineGate(
    scored.taskOutputScore,
    baseline.baselineScore,
    "IMPROVE"
  );
  const finalScore =
    0.3 * scored.taskOutputScore +
    0.4 * scored.promptScore +
    0.3 * baselineGate.baselineGateScore;
  return {
    output,
    ...scored,
    ...baselineGate,
    baselinePrompt: baseline.baselinePrompt,
    baselineOutput: baseline.baselineOutput,
    finalScore,
    progress: Math.round(finalScore * 100),
  };
}

async function evaluateReverseRound(round: Round, userPrompt: string) {
  const output = await runPromptWithContext(userPrompt);
  const scored = await scoreReverseOutcome(
    round,
    userPrompt,
    output
  );
  const baseline = await getReverseBaseline(round);
  const baselineGate = scoreBaselineGate(
    scored.taskOutputScore,
    baseline.baselineScore,
    "REVERSE"
  );
  const finalScore =
    0.3 * scored.taskOutputScore +
    0.4 * scored.promptScore +
    0.3 * baselineGate.baselineGateScore;
  return {
    output,
    recoveredPrompt: userPrompt,
    ...scored,
    ...baselineGate,
    baselinePrompt: baseline.baselinePrompt,
    baselineOutput: baseline.baselineOutput,
    finalScore,
    progress: Math.round(finalScore * 100),
  };
}

async function evaluateStructuredRound(round: Round, userPrompt: string) {
  const output = await runPromptWithContext(userPrompt, round.input, "Problem");
  const scored = await scoreStructuredOutcome(
    round,
    userPrompt,
    output
  );
  const baseline = await getStructuredBaseline(round);
  const baselineGate = scoreBaselineGate(
    scored.taskOutputScore,
    baseline.baselineScore,
    "STRUCTURED"
  );
  const finalScore =
    0.3 * scored.taskOutputScore +
    0.4 * scored.promptScore +
    0.3 * baselineGate.baselineGateScore;
  return {
    output,
    ...scored,
    ...baselineGate,
    baselinePrompt: baseline.baselinePrompt,
    baselineOutput: baseline.baselineOutput,
    finalScore,
    progress: Math.round(finalScore * 100),
  };
}

function normalizeCompiledPrompt(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  return trimmed
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function scoreBonusPromptCoverage(prompt: string, config: BonusEvalConfig): number {
  return clamp(
    0.65 * scoreChecks(prompt, config.promptChecks) +
      0.35 * scoreNamedSections(prompt, config.requiredSections)
  );
}

function scoreBonusOutputCoverage(output: string, config: BonusEvalConfig): number {
  return clamp(
    0.45 * scoreNamedSections(output, config.requiredSections) +
      0.35 * scoreChecks(output, config.outputFactChecks) +
      0.2 * scoreChecks(output, config.structureChecks)
  );
}

function scoreBonusOutputStructure(output: string, config: BonusEvalConfig): number {
  return clamp(
    0.5 * scoreChecks(output, config.structureChecks) +
      0.5 * evaluateStructure(output)
  );
}

export async function compileMetaPrompt({
  metaPrompt,
  basePrompt,
}: {
  metaPrompt: string;
  basePrompt: string;
}) {
  const normalizedMetaPrompt = metaPrompt.trim();
  const normalizedBasePrompt = basePrompt.trim();

  if (!normalizedMetaPrompt) {
    throw new Error("Meta prompt is required");
  }

  const key = cacheKey("bonus-compile", normalizedMetaPrompt, normalizedBasePrompt);
  const cached = cacheGet<string>(key);
  if (cached !== undefined) return cached;

  const completion = await callLLM(
    getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a prompt compiler for a prompt-engineering game. You must return only the improved prompt that should later be run against the scenario. Do not solve the scenario. Do not explain your reasoning. Do not wrap the output in markdown fences.",
        },
        {
          role: "user",
          content: `Meta-prompt:\n${normalizedMetaPrompt}\n\nScenario:\n${normalizedBasePrompt}\n\nReturn only the compiled prompt that should be executed later against the same scenario.`,
        },
      ],
    })
  );

  const compiledPrompt = normalizeCompiledPrompt(
    completion.choices[0].message.content ?? ""
  );
  cacheSet(key, compiledPrompt);
  return compiledPrompt;
}

export async function evaluateMetaBonusRound({
  metaPrompt,
  basePrompt,
  evalConfig,
}: {
  metaPrompt: string;
  basePrompt: string;
  evalConfig: BonusEvalConfig;
}) {
  try {
    if (!metaPrompt) {
      return {
        finalScore: 0,
        progress: 0,
        error: "Meta prompt is required",
      };
    }

    const compiledPrompt = await compileMetaPrompt({ metaPrompt, basePrompt });
    const finalOutput = await runPromptWithContext(compiledPrompt, basePrompt, "Scenario");
    const metaCoverageScore = scoreBonusPromptCoverage(metaPrompt, evalConfig);
    const compiledPromptCoverageScore = scoreBonusPromptCoverage(compiledPrompt, evalConfig);
    const outputScores = await scoreBonusOutput(finalOutput, evalConfig);
    const baseline = await getBonusBaseline(basePrompt, evalConfig);
    const baselineGate = scoreBaselineGate(
      outputScores.taskOutputScore,
      baseline.baselineScore,
      "BONUS"
    );

    const finalScore =
      0.3 * metaCoverageScore +
      0.3 * compiledPromptCoverageScore +
      0.1 * outputScores.outputCoverageScore +
      0.1 * outputScores.outputStructureScore +
      0.05 * outputScores.similarityScore +
      0.15 * baselineGate.baselineGateScore;

    return {
      compiledPrompt,
      finalOutput,
      scores: {
        metaCoverageScore,
        compiledPromptCoverageScore,
        outputCoverageScore: outputScores.outputCoverageScore,
        outputStructureScore: outputScores.outputStructureScore,
        similarityScore: outputScores.similarityScore,
      },
      ...outputScores,
      ...baselineGate,
      baselineMetaPrompt: baseline.baselineMetaPrompt,
      baselineCompiledPrompt: baseline.baselineCompiledPrompt,
      baselineOutput: baseline.baselineOutput,
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
      return evaluateOptimizeRound(round, userPrompt);
    case "STRUCTURED":
      return evaluateStructuredRound(round, userPrompt);
    case "CLASSIFY":
      return evaluateClassifyRound(round, answers ?? {});
    default:
      throw new Error("Unknown round type");
  }
}
