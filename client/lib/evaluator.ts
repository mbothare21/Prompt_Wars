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

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLabelMarkers(line: string): string {
  return line
    .trim()
    .replace(/^(?:#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)+/, "")
    .trim();
}

function findSectionLineIndex(text: string, section: string): number {
  const target = normalizeForMatch(section);
  if (!target) return -1;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = stripLabelMarkers(lines[i]);
    if (!raw) continue;

    const head = normalizeForMatch(raw.split(/[:\-–]/, 1)[0] ?? raw);
    if (head === target) return i;
    if (head.startsWith(`${target} `)) return i;
  }

  return -1;
}

function scoreRequiredSections(text: string, sections: string[]): number {
  if (sections.length === 0) return 1;

  let matched = 0;
  let ordered = 0;
  let previousIndex = -1;

  for (const section of sections) {
    const index = findSectionLineIndex(text, section);
    if (index >= 0) {
      matched++;
      if (index >= previousIndex) {
        ordered++;
        previousIndex = index;
      }
    }
  }

  return clamp(0.75 * (matched / sections.length) + 0.25 * (ordered / sections.length));
}

function scoreSectionMentions(text: string, sections: string[]): number {
  if (sections.length === 0) return 1;

  const normalized = normalizeForMatch(text);
  const matched = sections.filter((section) =>
    normalized.includes(normalizeForMatch(section))
  ).length;
  return matched / sections.length;
}

function extractSectionLabels(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => stripLabelMarkers(line))
    .map((line) => {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0 && colonIndex <= 40) {
        return line.slice(0, colonIndex).trim();
      }
      return line.replace(/:\s*$/, "").trim();
    })
    .filter((line) => line.length > 0);
}

const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "among",
  "another",
  "around",
  "because",
  "before",
  "between",
  "both",
  "could",
  "during",
  "each",
  "from",
  "have",
  "having",
  "into",
  "just",
  "more",
  "most",
  "must",
  "next",
  "only",
  "other",
  "over",
  "same",
  "should",
  "since",
  "some",
  "than",
  "that",
  "their",
  "there",
  "these",
  "this",
  "those",
  "through",
  "under",
  "very",
  "when",
  "where",
  "while",
  "with",
  "without",
  "would",
  "write",
  "prompt",
  "output",
  "section",
  "sections",
  "summary",
  "structured",
  "final",
  "answer",
  "step",
  "steps",
]);

function collectMeaningfulTokens(text: string, limit = 16): string[] {
  const seen = new Set<string>();
  const tokens = text.toLowerCase().match(/[a-z][a-z0-9'-]*/g) ?? [];
  const result: string[] = [];

  for (const token of tokens) {
    if (token.length < 4 || STOPWORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    result.push(token);
    if (result.length >= limit) break;
  }

  return result;
}

function scoreTokenGrounding(text: string, source: string): number {
  const sourceTokens = collectMeaningfulTokens(source);
  if (sourceTokens.length === 0) return 1;

  const outputTokens = new Set(collectMeaningfulTokens(text, 64));
  const matched = sourceTokens.filter((token) => outputTokens.has(token)).length;
  return clamp(matched / sourceTokens.length);
}

function scoreConcreteStructuredSolution(input: string, output: string): number {
  const inputLower = input.toLowerCase();
  const outputLower = output.toLowerCase();

  if (/\bwolf\b/.test(inputLower) && /\bgoat\b/.test(inputLower) && /\bcabbage\b/.test(inputLower)) {
    const mentionsActors = ["wolf", "goat", "cabbage"].every((token) => outputLower.includes(token));
    const mentionsSteps = /\b(step|first|second|third|then|return|cross)\b/.test(outputLower);
    const mentionsAnswer = /\b17\b/.test(outputLower) || /\b17\s*minutes?\b/.test(outputLower);
    return clamp(
      (mentionsActors ? 0.45 : 0) +
      (mentionsSteps ? 0.30 : 0) +
      (mentionsAnswer ? 0.25 : 0)
    );
  }

  if (/\b5-liter bucket\b/.test(inputLower) && /\b3-liter bucket\b/.test(inputLower)) {
    const mentionsSizes =
      (/\b5\s*-?\s*liter\b/.test(outputLower) || /\b5l\b/.test(outputLower)) &&
      (/\b3\s*-?\s*liter\b/.test(outputLower) || /\b3l\b/.test(outputLower));
    const mentionsGoal = /\b4\s*liters?\b/.test(outputLower);
    const mentionsActions = /\b(fill|empty|pour|transfer)\b/.test(outputLower);
    const mentionsSteps = /\b(step|first|second|then|sequence|1\.)\b/.test(outputLower);
    return clamp(
      (mentionsSizes ? 0.25 : 0) +
      (mentionsGoal ? 0.35 : 0) +
      (mentionsActions ? 0.20 : 0) +
      (mentionsSteps ? 0.20 : 0)
    );
  }

  if (/\btraveler a\b/.test(inputLower) && /\bflashlight\b/.test(inputLower)) {
    const mentionsTimes = ["1", "2", "7", "10"].every((n) => new RegExp(`\\b${n}\\b`).test(outputLower));
    const mentionsFlashlight = /\bflashlight\b/.test(outputLower) || /\btorch\b/.test(outputLower);
    const mentionsAnswer = /\b17\b/.test(outputLower) || /\b17\s*minutes?\b/.test(outputLower);
    const mentionsSteps = /\b(step|first|second|then|return|cross)\b/.test(outputLower);
    return clamp(
      (mentionsTimes ? 0.35 : 0) +
      (mentionsFlashlight ? 0.15 : 0) +
      (mentionsAnswer ? 0.35 : 0) +
      (mentionsSteps ? 0.15 : 0)
    );
  }

  return scoreTokenGrounding(output, input);
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

function buildImproveRubric(constraints: unknown): string {
  const c = isPlainObject(constraints) ? (constraints as Record<string, unknown>) : {};
  const sections: string[] = Array.isArray(c.requiredSections) ? (c.requiredSections as string[]) : [];
  const maxWords: number | null = typeof c.maxWords === "number" ? c.maxWords : null;

  const sectionList = sections.length ? sections.join(", ") : "key structured sections";
  const wordLimit = maxWords ? `≤${maxWords} words` : "a specified word limit";

  return `You are a scoring engine for a prompt-engineering game.

The player was given a weak prompt and a meeting/business transcript. Their task: write an improved prompt that makes an AI extract a structured summary with these required sections: ${sectionList}, in ${wordLimit}.

Score the player's PROMPT and OUTPUT using these explicit criteria.

PROMPT score (0–1):
• +0.25 if the prompt assigns a clear role or persona (e.g. "You are a business analyst...")
• +0.40 based on how many required sections are explicitly named in the prompt (named/total × 0.40)
• +0.20 if the prompt specifies the word or length constraint
• +0.15 if the prompt uses clear action language (summarize, extract, identify, list...)
• +0.15 if the prompt uses negative prompting to stay grounded in the provided input and avoid inventing details
• +0.15 if the prompt explicitly says not to hallucinate or add extra information

OUTPUT score (0–1):
• +0.40 if all required sections appear in the output, clearly labeled
• +0.20 if the output word count is within the limit
• +0.25 based on relevance and accuracy of extracted content
• +0.15 based on conciseness and structure

Return JSON only — no markdown, no explanation:
{"quality": <output_score_0_to_1>, "prompt": <prompt_score_0_to_1>}`;
}

function buildOptimizeRubric(): string {
  return `You are a scoring engine for a prompt-engineering game.

The player's task: write a concise prompt (ideally ≤15 words) that makes an AI explain a technical concept using a clear analogy or comparison.

Score using these explicit criteria.

PROMPT score (0–1):
• +0.35 if the prompt is ≤15 words
• +0.30 if the prompt explicitly requests or implies an analogy, comparison, or metaphor
• +0.20 if the prompt is clear and action-oriented
• +0.15 if the prompt gives useful scope (audience, format, or style)

OUTPUT quality score (0–1):
• +0.35 if the output uses a concrete analogy or comparison
• +0.30 based on how easy the explanation is to understand for a non-expert
• +0.20 if the analogy is accurate and relevant to the concept
• +0.15 based on overall explanation quality

ANALOGY score (0–1):
• How effective, clear, and creative is the analogy? Score independently from 0 to 1.

Return JSON only — no markdown, no explanation:
{"quality": <output_quality_0_to_1>, "analogy": <analogy_score_0_to_1>, "prompt": <prompt_score_0_to_1>}`;
}

function buildReverseRubric(expectedOutput: string): string {
  return `You are a scoring engine for a prompt-engineering game.

The player was shown a target output and must reconstruct the prompt that would produce it.

Target output:
${expectedOutput}

Score using these explicit criteria.

PROMPT score (0–1):
• +0.30 if the prompt assigns a role or persona matching the domain of the target output
• +0.30 if the prompt explicitly names or references the structural sections/elements visible in the target output
• +0.20 if the prompt specifies the output format (bullet points, numbered list, labeled sections, etc.)
• +0.20 if the prompt uses precise language that mirrors the target output's style and tone

OUTPUT score (0–1) — how closely the generated output resembles the target:
• +0.40 based on structural match (sections, format, order)
• +0.35 based on content coverage (key concepts, entities, facts from the target)
• +0.15 based on stylistic match (tone, voice, level of detail)
• +0.10 based on overall coherence and quality

Return JSON only — no markdown, no explanation:
{"quality": <output_score_0_to_1>, "prompt": <prompt_score_0_to_1>}`;
}

function buildStructuredRubric(): string {
  return `You are a scoring engine for a prompt-engineering game.

The player's task: write a prompt that makes an AI solve a logic or constraint-based problem step-by-step, showing its reasoning explicitly.

Score using these explicit criteria.

PROMPT score (0–1):
• +0.30 if the prompt explicitly requests step-by-step or systematic reasoning
• +0.25 if the prompt instructs the AI to identify constraints or rules before solving
• +0.25 if the prompt requires a clearly labeled or structured final answer
• +0.20 if the prompt assigns a relevant role or analytical persona

OUTPUT score (0–1):
• +0.40 if the output shows clear, explicit step-by-step reasoning
• +0.30 if the output correctly identifies and applies the problem's constraints
• +0.20 if the output has a clearly labeled final answer
• +0.10 based on overall accuracy, clarity, and coherence

Return JSON only — no markdown, no explanation:
{"quality": <output_score_0_to_1>, "prompt": <prompt_score_0_to_1>}`;
}

async function scoreCombined(
  userPrompt: string,
  output: string,
  context?: {
    roundType: "IMPROVE" | "OPTIMIZE" | "REVERSE" | "STRUCTURED";
    constraints?: unknown;
    expectedOutput?: string;
  }
): Promise<CombinedScores> {
  const key = cacheKey(
    "combined",
    userPrompt,
    output,
    context?.roundType ?? "",
    JSON.stringify(context?.constraints ?? null),
    context?.expectedOutput ?? ""
  );
  const cached = cacheGet<CombinedScores>(key);
  if (cached) return cached;

  const systemPrompt =
    context?.roundType === "IMPROVE"
      ? buildImproveRubric(context.constraints)
      : context?.roundType === "OPTIMIZE"
        ? buildOptimizeRubric()
        : context?.roundType === "REVERSE"
          ? buildReverseRubric(context.expectedOutput ?? "")
          : context?.roundType === "STRUCTURED"
            ? buildStructuredRubric()
            : `You are a scoring engine.

Return JSON only — no markdown, no explanation:
{
  "quality": number,
  "analogy": number,
  "prompt": number
}
Score each from 0 to 1.`;

  try {
    const res = await callLLM(
      getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Prompt:\n${userPrompt}\n\nOutput:\n${output}` },
        ],
        response_format: { type: "json_object" },
      })
    );

    const text = res.choices[0].message.content?.trim() ?? "{}";
    const parsed = JSON.parse(text) as Partial<CombinedScores>;
    const scores: CombinedScores = {
      quality: clamp(Number(parsed.quality)),
      analogy: clamp(Number(parsed.analogy ?? 0)),
      prompt: clamp(Number(parsed.prompt)),
    };
    cacheSet(key, scores);
    return scores;
  } catch (error) {
    throw new Error(
      `Combined scoring failed: ${error instanceof Error ? error.message : String(error)}`
    );
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
    if (scoreRequiredSections(output, c.requiredSections) >= 1) score++;
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

// ── Prompt constraint coverage ────────────────────────────────────────────────
// Checks whether the player's prompt explicitly addresses the constraints shown
// to them in the UI. Missing constraint coverage → deducted marks.

function scorePromptConstraintCoverage(constraints: unknown, prompt: string): number {
  if (constraints == null) return 1;
  if (!isPlainObject(constraints)) return 1;

  const c = constraints as ObjectConstraints;
  let score = 0;
  let total = 0;
  const promptNormalized = normalizeForMatch(prompt);

  if (c.requiredSections?.length) {
    total++;
    const mentioned = c.requiredSections.filter((s) =>
      promptNormalized.includes(normalizeForMatch(s))
    ).length;
    score += mentioned / c.requiredSections.length;
  }

  if (c.maxWords != null) {
    total++;
    if (/\b(max|maximum|word|brief|concise|short|limit|\d+\s*word)/i.test(prompt)) {
      score += 1;
    }
  }

  if (c.requireSteps) {
    total++;
    if (
      /\b(step|steps|numbered|systematically|sequentially|one by one|breakdown)\b/i.test(
        prompt
      )
    ) {
      score += 1;
    }
  }

  // Negative prompting: explicitly tell the model what not to do.
  // This matters for summarize/extract-style tasks where the prompt should
  // prevent invention, hallucination, or unsupported additions.
  if (c.requiredSections?.length || c.maxWords != null) {
    total++;
    if (hasNegativePrompting(prompt)) {
      score += 1;
    }

    total++;
    if (hasGroundingInstruction(prompt)) {
      score += 1;
    }
  }

  return total === 0 ? 1 : score / total;
}

export function hasNegativePrompting(prompt: string): boolean {
  return (
    /\b(do not|don't|avoid|only|solely|strictly|limit(?:\s+your)?\s+response)\b/i.test(prompt) &&
    /\b(input data|provided input|source text|source material|given text|original text|information provided|do not add|don't add|no extra information|without adding|don't invent|do not invent|no outside information|use only|based only on|ground(?:ed)? in)\b/i.test(prompt)
  );
}

export function hasGroundingInstruction(prompt: string): boolean {
  return /\b(no hallucination|no hallucinations|don't hallucinate|do not hallucinate|no extra information|no extra info|use only the input data|use only the provided input|based only on the input|ground(?:ed)? in the input|stay grounded in the input|only use the input data)\b/i.test(prompt);
}

// ── Structure heuristics ──────────────────────────────────────────────────────

function getBrevityScore(prompt: string): number {
  const words = prompt.trim().split(/\s+/).filter(Boolean).length;
  if (words > 15) return 0;
  return 1 - (words / 15) * 0.5;
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

  const [output, baseline] = await Promise.all([
    runPromptWithContext(userPrompt, round.input, "Task"),
    getOptimizeBaseline(round),
  ]);
  const scored = await scoreOptimizeOutcome(
    round,
    userPrompt,
    output
  );
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
  const { quality: qualityScore, prompt: rawPromptScore } = await scoreCombined(
    prompt,
    output,
    { roundType: "IMPROVE", constraints: round.constraints }
  );
  const constraintScore = checkConstraints(round.constraints, prompt, output);
  const constraintCoverage = scorePromptConstraintCoverage(round.constraints, prompt);
  const requiredSectionsScore =
    isPlainObject(round.constraints) && Array.isArray((round.constraints as ObjectConstraints).requiredSections)
      ? scoreRequiredSections(output, (round.constraints as ObjectConstraints).requiredSections ?? [])
      : 1;
  const groundingScore = scoreTokenGrounding(output, round.input ?? round.expectedOutput ?? "");
  const promptScore = clamp(0.6 * rawPromptScore + 0.4 * constraintCoverage);
  const similarityScore = round.expectedOutput
    ? await getSimilarity(output, round.expectedOutput)
    : 1;
  const taskOutputScore =
    0.35 * qualityScore +
    0.25 * similarityScore +
    0.20 * constraintScore +
    0.10 * requiredSectionsScore +
    0.10 * groundingScore;

  return {
    qualityScore,
    similarityScore,
    requiredSectionsScore,
    groundingScore,
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
  const [similarity, rubric] = await Promise.all([
    getSimilarity(output, target),
    scoreCombined(prompt, output, { roundType: "REVERSE", expectedOutput: target }),
  ]);
  const constraintScore = checkConstraints(round.constraints, prompt, output);
  const constraintCoverage = scorePromptConstraintCoverage(round.constraints, prompt);
  const targetStructureScore = scoreRequiredSections(output, extractSectionLabels(target));
  const groundingScore = scoreTokenGrounding(output, target);
  const promptScore = clamp(0.6 * rubric.prompt + 0.4 * constraintCoverage);
  const taskOutputScore = clamp(
    0.35 * similarity +
    0.20 * rubric.quality +
    0.15 * constraintScore +
    0.15 * targetStructureScore +
    0.15 * groundingScore
  );

  return {
    similarity,
    targetStructureScore,
    groundingScore,
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
    await scoreCombined(prompt, output, { roundType: "OPTIMIZE" });
  const groundingScore = scoreTokenGrounding(output, round.input ?? "");
  const taskOutputScore =
    0.40 * qualityScore +
    0.30 * analogyQualityScore +
    0.30 * groundingScore;
  const promptCraftScore = 0.6 * brevityScore + 0.4 * promptScore;

  return {
    brevityScore,
    qualityScore,
    analogyQualityScore,
    groundingScore,
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
  const constraintScore = checkConstraints(round.constraints, prompt, output);
  const constraintCoverage = scorePromptConstraintCoverage(round.constraints, prompt);
  const concreteSolutionScore = scoreConcreteStructuredSolution(round.input ?? "", output);
  const rubric = await scoreCombined(prompt, output, { roundType: "STRUCTURED", constraints: round.constraints });
  const promptScore = clamp(0.6 * rubric.prompt + 0.4 * constraintCoverage);
  const taskOutputScore = clamp(
    0.20 * reasoningScore +
    0.15 * structureScore +
    0.25 * rubric.quality +
    0.20 * constraintScore +
    0.20 * concreteSolutionScore
  );

  return {
    reasoningScore,
    structureScore,
    concreteSolutionScore,
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
  const [output, baseline] = await Promise.all([
    runPromptWithContext(userPrompt, round.input, "Source Text"),
    getImproveBaseline(round),
  ]);
  const scored = await scoreImproveOutcome(
    round,
    userPrompt,
    output
  );
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
  const [output, baseline] = await Promise.all([
    runPromptWithContext(userPrompt),
    getReverseBaseline(round),
  ]);
  const scored = await scoreReverseOutcome(
    round,
    userPrompt,
    output
  );
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
  const [output, baseline] = await Promise.all([
    runPromptWithContext(userPrompt, round.input, "Problem"),
    getStructuredBaseline(round),
  ]);
  const scored = await scoreStructuredOutcome(
    round,
    userPrompt,
    output
  );
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
    0.6 * scoreChecks(prompt, config.promptChecks) +
      0.4 * scoreSectionMentions(prompt, config.requiredSections)
  );
}

function scoreBonusOutputCoverage(output: string, config: BonusEvalConfig): number {
  return clamp(
    0.5 * scoreRequiredSections(output, config.requiredSections) +
      0.35 * scoreChecks(output, config.outputFactChecks) +
      0.15 * scoreChecks(output, config.structureChecks)
  );
}

function scoreBonusOutputStructure(output: string, config: BonusEvalConfig): number {
  return clamp(
    0.6 * scoreChecks(output, config.structureChecks) +
      0.4 * evaluateStructure(output)
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
      0.25 * metaCoverageScore +
      0.20 * compiledPromptCoverageScore +
      0.20 * outputScores.outputCoverageScore +
      0.10 * outputScores.outputStructureScore +
      0.15 * outputScores.similarityScore +
      0.10 * baselineGate.baselineGateScore;

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
    throw new Error("Evaluation failed");
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
