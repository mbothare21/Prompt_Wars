import "server-only";

import { getOpenAI } from "./openai";
import { getSimilarity } from "./similarity";
import type { Round } from "./types";
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
type BonusCheck = { label: string; test: (text: string) => boolean };
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

const BONUS_TARGET_OUTPUT = `Subject: Aurora Identity Migration - Status Update and Go/No-Go Recommendation

Dear Stakeholders,

Executive Summary:
Aurora is currently 3 weeks behind the original May 15 enterprise cutover due to an Okta SCIM provisioning failure caused by a vendor schema change. We can still reach a revised June 9 cutover if we approve a phased rollout, lock a weekend change freeze, and finalize the go/no-go decision by Wednesday at 4 PM.

Current Status:
- Scope: Identity migration for 38,000 employee accounts and 6,200 contractor accounts across the US, EU, and APAC
- Coverage: Automated regression coverage is 71% against a 92% target
- Reliability: 9 Sev-2 authentication incidents in the last 30 days against a 99.95% uptime SLO
- Team: 3 senior IAM engineers, 2 newly onboarded contractors, and 1 QA lead
- Customer impact planning: Customer Success needs outreach for 47 strategic accounts

Root Cause Analysis:
An external vendor schema change broke Okta SCIM provisioning, and the fallback batch-sync process is now duplicating accounts in 4 of 12 regions. The issue surfaced during regional validation and exposed insufficient automated coverage around provisioning edge cases.

Impact Assessment:
- Timeline: The original May 15 cutover is no longer achievable; the revised target is June 9
- Security and compliance: MFA enforcement remains mandatory before go-live, and Legal has flagged GDPR concerns around EU log retention
- Operational risk: Continued identity instability increases the likelihood of missing the 99.95% uptime SLO
- Financial: Additional spend is capped at $180k, and the external identity consultant would cost $95k
- Customer risk: 47 strategic accounts require proactive communication before any phased rollout

Decision Required:
Please approve by Wednesday 4 PM:
1. A phased regional rollout instead of a single global cutover
2. A Saturday 10 PM-2 AM production maintenance-window freeze
3. The $95k consultant engagement within the $180k contingency cap

Recovery Plan:
1. Stabilize SCIM mappings and stop duplicate account creation in the 4 affected regions
2. Raise regression coverage from 71% to 92% before final cutover
3. Complete MFA readiness checks and validate GDPR-compliant EU log retention
4. Prepare Customer Success communications for all 47 strategic accounts
5. Use the Saturday maintenance window for phased production release

Risk Mitigation:
- Maintain a rollback path to the legacy identity flow for one full maintenance cycle
- Add regional checkpoints with Security and Compliance signoff before expansion
- Run war-room monitoring during cutover to protect the 99.95% uptime SLO

Revised Timeline:
| Milestone | Original Date | Revised Date |
|-----------|---------------|--------------|
| SCIM fix complete | May 1 | May 22 |
| Regression coverage >= 92% | May 8 | May 29 |
| MFA + GDPR signoff | May 10 | June 3 |
| Strategic account communications sent | May 12 | June 5 |
| Production cutover | May 15 | June 9 |

Next Steps:
- [ ] Finalize the go/no-go recommendation deck for Wednesday 4 PM
- [ ] Confirm consultant contract and budget approval
- [ ] Complete the regional duplicate-account remediation plan
- [ ] Publish the customer communication draft for the 47 strategic accounts
- [ ] Confirm Saturday 10 PM-2 AM cutover staffing and war-room ownership

Best regards,
Program Lead, Aurora Identity Migration`;

const BONUS_REQUIRED_SECTIONS = [
  "Executive Summary",
  "Current Status",
  "Root Cause Analysis",
  "Impact Assessment",
  "Decision Required",
  "Recovery Plan",
  "Revised Timeline",
  "Risk Mitigation",
  "Next Steps",
];

const BONUS_PROMPT_CHECKS: BonusCheck[] = [
  {
    label: "executive stakeholder email",
    test: (text) =>
      /\b(email|update|memo|status)\b/i.test(text) &&
      /\b(stakeholder|executive|leadership)\b/i.test(text),
  },
  {
    label: "subject line instruction",
    test: (text) => /\bsubject\b/i.test(text),
  },
  {
    label: "explicit sections or headings",
    test: (text) =>
      countNamedSections(text) >= 4 ||
      /\b(section|heading|structured output|explicit sections?)\b/i.test(text),
  },
  {
    label: "quantified facts and dates",
    test: (text) =>
      /\b(exact|specific|quantified|numeric|numbers?|metrics|dates?)\b/i.test(text) ||
      /(38,?000|6,?200|71%|92%|99\.95%|180k|95k|47 strategic|may 15|june 9)/i.test(text),
  },
  {
    label: "timeline or milestone table",
    test: (text) => /\b(table|timeline|milestone)\b/i.test(text),
  },
  {
    label: "risk mitigation and rollback",
    test: (text) => /\b(risk|mitigation|rollback|fallback|monitoring)\b/i.test(text),
  },
  {
    label: "compliance and security requirements",
    test: (text) => /\b(gdpr|compliance|security|mfa|retention)\b/i.test(text),
  },
  {
    label: "decision request and deadline",
    test: (text) =>
      /\b(decision|approve|go\/?no-go|recommendation|deadline)\b/i.test(text) ||
      /\b(wednesday|4 ?pm)\b/i.test(text),
  },
  {
    label: "customer communications",
    test: (text) =>
      /\b(customer success|strategic accounts?|customer communication|outreach)\b/i.test(text),
  },
  {
    label: "phased rollout and maintenance window",
    test: (text) =>
      /\b(phased rollout|regional rollout|maintenance window|change freeze|cutover window)\b/i.test(text),
  },
  {
    label: "professional tone",
    test: (text) => /\b(professional|clear|concise|executive tone)\b/i.test(text),
  },
];

const BONUS_OUTPUT_FACT_CHECKS: BonusCheck[] = [
  {
    label: "subject line",
    test: (text) => /^subject:\s*aurora identity migration/i.test(text.trim()),
  },
  {
    label: "delay and revised cutover",
    test: (text) =>
      /\b3 weeks behind\b/i.test(text) &&
      /\bmay 15\b/i.test(text) &&
      /\bjune 9\b/i.test(text),
  },
  {
    label: "SCIM root cause and affected regions",
    test: (text) =>
      /\bokta\b/i.test(text) &&
      /\bscim\b/i.test(text) &&
      /\bschema change\b/i.test(text) &&
      /\bduplicate\w*\b/i.test(text) &&
      /\b4 of 12 regions\b/i.test(text),
  },
  {
    label: "account scope and regional coverage",
    test: (text) =>
      /38,?000/.test(text) &&
      /6,?200/.test(text) &&
      /\b(us|eu|apac)\b/i.test(text),
  },
  {
    label: "reliability and test metrics",
    test: (text) =>
      /99\.95%/.test(text) &&
      /\b9\s+sev-2\b/i.test(text) &&
      /71%/.test(text) &&
      /92%/.test(text),
  },
  {
    label: "compliance and security requirements",
    test: (text) =>
      /\bgdpr\b/i.test(text) &&
      /\beu\b/i.test(text) &&
      /\blog retention\b/i.test(text) &&
      /\bmfa\b/i.test(text),
  },
  {
    label: "budget and consultant tradeoff",
    test: (text) =>
      /\b180k\b/i.test(text) &&
      /\b95k\b/i.test(text) &&
      /\bconsultant\b/i.test(text),
  },
  {
    label: "customer communication scope",
    test: (text) =>
      /\b47 strategic accounts?\b/i.test(text) ||
      (/\b47\b/.test(text) && /\bcustomer/i.test(text)),
  },
  {
    label: "decision deadline and maintenance window",
    test: (text) =>
      /\bwednesday\b/i.test(text) &&
      /\b4 ?pm\b/i.test(text) &&
      /\bsaturday\b/i.test(text) &&
      /\b10 ?pm\b/i.test(text) &&
      /\b2 ?am\b/i.test(text),
  },
  {
    label: "phased rollout recommendation",
    test: (text) => /\bphased rollout\b/i.test(text),
  },
  {
    label: "timeline table",
    test: (text) =>
      /\|.*milestone.*original date.*revised date.*\|/i.test(text) ||
      (/\bmilestone\b/i.test(text) && /\brevised date\b/i.test(text)),
  },
  {
    label: "checklist-style next steps",
    test: (text) => /\[[ xX]?\]/.test(text) || /\bnext steps:\b/i.test(text),
  },
];

const BONUS_EMAIL_STRUCTURE_CHECKS: BonusCheck[] = [
  {
    label: "salutation",
    test: (text) => /\bdear stakeholders\b/i.test(text),
  },
  {
    label: "closing",
    test: (text) => /\b(best regards|regards|sincerely)\b/i.test(text),
  },
  {
    label: "multiple paragraphs",
    test: (text) =>
      text
        .split(/\n\s*\n/)
        .filter((paragraph) => paragraph.trim().length > 0).length >= 4,
  },
  {
    label: "table formatting",
    test: (text) => /\|.+\|/.test(text),
  },
  {
    label: "checklist formatting",
    test: (text) => /\[[ xX]?\]/.test(text),
  },
];

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

function countNamedSections(text: string): number {
  const normalized = text.toLowerCase();
  return BONUS_REQUIRED_SECTIONS.filter((section) =>
    normalized.includes(section.toLowerCase())
  ).length;
}

function scoreNamedSections(text: string): number {
  return BONUS_REQUIRED_SECTIONS.length === 0
    ? 1
    : countNamedSections(text) / BONUS_REQUIRED_SECTIONS.length;
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
  return round.originalPrompt?.trim() || "Summarize this.";
}

function getReverseBaselinePrompt(round: Round): string {
  const example = round.expectedOutput?.trim();
  return example
    ? `Use the example below as inspiration to generate a startup brief in a similar format.\n\nExample:\n${example}`
    : "Write a structured startup idea.";
}

function getOptimizeBaselinePrompt(round: Round): string {
  return round.input?.trim() || "Explain this simply using an analogy.";
}

function getStructuredBaselinePrompt(): string {
  return "Solve this problem.";
}

function getBonusBaselineMetaPrompt(): string {
  return "Write a prompt that turns the scenario into an executive stakeholder update.";
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

async function scoreBonusOutput(finalOutput: string) {
  const outputCoverageScore = scoreBonusOutputCoverage(finalOutput);
  const outputStructureScore = scoreBonusOutputStructure(finalOutput);
  const similarityScore = await getSimilarity(finalOutput, BONUS_TARGET_OUTPUT);
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

async function getBonusBaseline(basePrompt: string) {
  const baselineMetaPrompt = getBonusBaselineMetaPrompt();
  return getOrComputeCached(
    cacheKey("baseline", "BONUS", baselineMetaPrompt, basePrompt),
    async () => {
      const baselineCompiledPrompt = await compileMetaPrompt({
        metaPrompt: baselineMetaPrompt,
        basePrompt,
      });
      const baselineOutput = await runPromptWithContext(
        baselineCompiledPrompt,
        basePrompt,
        "Scenario"
      );
      const scored = await scoreBonusOutput(baselineOutput);
      return {
        baselineMetaPrompt,
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
    0.45 * scored.taskOutputScore +
    0.25 * scored.promptScore +
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
    0.45 * scored.taskOutputScore +
    0.25 * scored.promptScore +
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
    0.45 * scored.taskOutputScore +
    0.25 * scored.promptScore +
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

function scoreBonusPromptCoverage(prompt: string): number {
  return clamp(
    0.65 * scoreChecks(prompt, BONUS_PROMPT_CHECKS) +
      0.35 * scoreNamedSections(prompt)
  );
}

function scoreBonusOutputCoverage(output: string): number {
  return clamp(
    0.45 * scoreNamedSections(output) +
      0.35 * scoreChecks(output, BONUS_OUTPUT_FACT_CHECKS) +
      0.2 * scoreChecks(output, BONUS_EMAIL_STRUCTURE_CHECKS)
  );
}

function scoreBonusOutputStructure(output: string): number {
  return clamp(
    0.5 * scoreChecks(output, BONUS_EMAIL_STRUCTURE_CHECKS) +
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
}: {
  metaPrompt: string;
  basePrompt: string;
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
    const metaCoverageScore = scoreBonusPromptCoverage(metaPrompt);
    const compiledPromptCoverageScore = scoreBonusPromptCoverage(compiledPrompt);
    const outputScores = await scoreBonusOutput(finalOutput);
    const baseline = await getBonusBaseline(basePrompt);
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
