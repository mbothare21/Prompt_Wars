import "server-only";

import { getRoundSetIndex } from "./generateRounds";

// Set-keyed ideal prompts per round. The variant the player saw is selected
// from sessionId via getRoundSetIndex, mirroring the same hash used by
// generateRounds(). Variants are ordered to match ROUND_*_SETS in
// generateRounds.ts.
//
// IMPORTANT: this module is server-only. The prompts ship inline inside the
// downloadable HTML report and must never appear in any JSON response, UI
// surface, or client bundle — keep them behind this import "server-only"
// barrier so a stray client import fails at build time.

const ROUND_2: string[] = [
  // Set 1 — Product launch meeting
  `You are a senior business analyst. Read the meeting notes below and
produce a structured executive summary in 200 words or fewer, grounded
strictly in the input — no outside facts, no invented numbers.

Use these exact section headings, in this order:
1. Decisions             — what was actually decided ("None finalized" if so)
2. Conflicts             — disagreements between teams and the tradeoff at stake
3. Risks & Dependencies  — QA, supply chain, finance, customer risks
4. Unknowns / Gaps       — missing ownership, undefined plans, unconfirmed approvals
5. Next Steps            — agreed follow-up actions and open questions

Rules:
- Bullet points only. No prose paragraphs.
- Quote names, dates, and figures verbatim from the input.
- Stay under the 200-word cap.

[MEETING NOTES]
{input}`,

  // Set 2 — Customer retention review
  `You are a senior business analyst. Read the strategy-review notes below and
produce a structured executive summary in 200 words or fewer, grounded
strictly in the input — no outside facts.

Use these exact section headings, in this order:
1. Conflicts       — disagreements and the tradeoff at stake
2. Decisions made  — what leadership actually decided
3. Dependencies    — what is blocked and on whom
4. Risks           — churn, renewals, sentiment, cost
5. Next steps      — agreed analyses and design work

Rules:
- 2–3 bullets per section. Use only stated facts.
- Stay under the 200-word cap.

[NOTES]
{input}`,

  // Set 3 — Operational review (support delays)
  `You are a senior operations analyst. Read the review notes below and
produce a structured operational summary in 200 words or fewer, grounded
strictly in the input — no outside facts.

Use these exact section headings, in this order:
1. Conflicts       — disagreements between Support and Engineering
2. Decisions made  — leadership's prioritization call
3. Dependencies    — compliance and infrastructure blockers
4. Risks           — dissatisfaction, SLA breaches, burnout, reputation
5. Next steps      — documentation, escalation, communication, automation

Rules:
- Bullet points under each heading. Only stated facts.
- Stay under the 200-word cap.

[NOTES]
{input}`,
];

const ROUND_3: string[] = [
  // Set 1 — Smart Habit AI startup brief
  `You are an experienced startup analyst. Generate a structured Startup Brief
for the venture described below.

Topic: Smart Habit AI — an AI that helps young professionals and students
build consistent habits via behavior tracking, adaptive plans, gamified
streaks, and accountability reminders. Subscription + premium insights
revenue. Differentiator: real-time behavioral adaptation.

Use these exact section headings, in this order, each with concise content:
Problem, Solution, Audience, Features, Revenue, Differentiator, Tagline, Risks.

Format: heading on its own line, then 1–4 short bullets or a single
sentence beneath. Tone: crisp, founder-ready. No preamble, no closing
remarks beyond the final section.`,

  // Set 2 — Payment Gateway Incident postmortem
  `You are an SRE writing an internal incident postmortem. Generate a
structured Incident Report for the disruption described below.

Subject: Payment Gateway Service Disruption on March 14 — 38% payment
failures over a 2-hour window across North America and parts of Europe,
caused by a misconfigured load balancer routing traffic to outdated
service instances during a scheduled deployment.

Use these exact section headings, in this order, each with concise content:
Incident Summary, Root Cause, Timeline, Impact, Actions Taken, Risks, Next Steps.

Format the Timeline as "HH:MM AM/PM – event". Use bullets elsewhere.
Tone: precise, decision-ready. No filler.`,

  // Set 3 — Smart Study Planner PRD
  `You are a product manager writing a focused PRD. Generate a structured
Product Requirements Document for the product described below.

Product: Smart Study Planner — AI-powered study assistant that creates
adaptive schedules, auto-prioritizes by deadline and difficulty, tracks
progress, and sends smart reminders. Targets university students,
competitive-exam aspirants, and working professionals pursuing
certifications. Success target: 25% increase in study consistency.
MVP delivery in 8 weeks.

Use these exact section headings, in this order, each with concise content:
Problem Statement, Objective, Target Audience, Core Features,
Success Metrics, Risks, Timeline.

Format: heading on its own line, then short bullets. Include concrete
metrics (percentages, weeks) where stated. Tone: PM-ready, no fluff.`,
];

const ROUND_4: string[] = [
  `Explain quantum entanglement to a curious 12-year-old using a pair of
magic dice analogy. Use 60–80 words, simple language, one everyday example.`,
];

const ROUND_5: string[] = [
  // Set 1 — Wolf, goat, cabbage
  `You are a careful logic puzzle solver. Solve the river-crossing puzzle
below by following this procedure.

Step 1 — Restate the goal: ferry the wolf, goat, and cabbage to the
        opposite bank without any rule violation.

Step 2 — List every rule as a numbered list:
        1. Only one item carried at a time
        2. Wolf must never be alone with the goat
        3. Goat must never be alone with the cabbage

Step 3 — Solve move-by-move. After each move write:
        "State: NearBank={...}, FarBank={...}, BoatWith={...}"
        Every move must be legal under Step 2.

Step 4 — Verify the final state has all three items on the far bank.

Step 5 — Output the answer in this exact format:

         FINAL ANSWER:
         <one-line summary>
         Sequence of moves:
         1. <move 1>
         2. <move 2>
         ...

Do not skip steps. Do not invent rules.

[PUZZLE]
{input}`,

  // Set 2 — Water bucket (5L / 3L → 4L)
  `You are a careful logic puzzle solver. Solve the water-bucket puzzle
below by following this procedure.

Step 1 — Restate the goal: measure exactly 4 liters using a 5-liter and a
        3-liter bucket. Confirm the goal is achievable under the stated
        capacities; if not, stop and explain.

Step 2 — List every allowed action:
        1. Fill any bucket completely
        2. Empty any bucket completely
        3. Transfer water between buckets (stop when source is empty or
           destination is full)
        No external measurement is allowed.

Step 3 — Solve move-by-move. After each move write:
        "State: 5L=<x>, 3L=<y>"
        Every transfer must respect bucket capacity.

Step 4 — Verify the final state has exactly one bucket reading 4L.

Step 5 — Output the answer in this exact format:

         FINAL ANSWER:
         <one-line summary>
         Sequence of moves:
         1. <move> → State: 5L=<x>, 3L=<y>
         2. ...

Do not skip steps. Do not invent operations.

[PUZZLE]
{input}`,

  // Set 3 — Bridge and torch
  `You are a careful logic puzzle solver. Solve the bridge-and-torch puzzle
below by following this procedure.

Step 1 — Restate the goal: get all four travelers (A=1m, B=2m, C=7m,
        D=10m) across the bridge in the minimum total time.

Step 2 — List every rule:
        1. At most two cross together
        2. The flashlight is mandatory for any crossing
        3. The flashlight must be carried back for the next group
        4. A pair crosses at the slower person's speed

Step 3 — Solve move-by-move. After each crossing write:
        "State: NearSide={...}, FarSide={...}, FlashlightAt=<side>, Elapsed=<m>min"
        Each crossing time = max of the pair's speeds.

Step 4 — Verify all four are on the far side and total elapsed is minimal
        (target: 17 minutes).

Step 5 — Output the answer in this exact format:

         FINAL ANSWER: Total time = <X> minutes
         Sequence of crossings:
         1. <move> (<time>) → Elapsed: <m>min
         2. ...

Do not skip steps. Do not invent rules.

[PUZZLE]
{input}`,
];

const ROUND_6: string[] = [
  // Set 1 — Aurora identity-platform migration (BI operations report)
  `You are a senior Business Analyst. Take the scenario the user provides
and produce a concise, professional BI-style operations report grounded
strictly in the input — no invented facts, dates, names, or numbers.

Use these exact section headings, in this order:
1. Overview
2. Stats Snapshot
3. Analysis
4. BI Insights
5. Recommended Actions

Per-section rules:
- Overview: 2–3 sentences using only stated facts.
- Stats Snapshot: bullet every metric, percentage, count, headcount,
  budget figure, deadline, SLO, and date from the input — verbatim.
- Analysis: tie operational, security, compliance, customer, and
  financial implications to specific stats.
- BI Insights: 4–6 bullets surfacing patterns, tradeoffs, and risk
  concentrations that follow directly from the data.
- Recommended Actions: numbered list of 4–6 steps, each mapped to a
  stat or risk above.

Constraints:
- Use only information present in the scenario. Write "not specified"
  for missing values — never estimate.
- Cover security, compliance (MFA, GDPR, retention), customer / account
  impact, budget tradeoffs, and operational readiness wherever present.
- Tone: executive, concise, professional, clear.
- Title the report "Aurora BI Operations Report" and end with
  "Best regards, Program Analytics Team".`,

  // Set 2 — Fintech security incident (BI incident report)
  `You are a senior Business Analyst. Take the scenario the user provides
and produce a concise, professional BI-style incident report grounded
strictly in the input — no invented facts, names, or numbers.

Use these exact section headings, in this order:
1. Overview
2. Stats Snapshot
3. Analysis
4. BI Insights
5. Recommended Actions

Per-section rules:
- Overview: 2–3 sentences using only stated facts.
- Stats Snapshot: bullet every metric, percentage, count, region,
  cluster, and time window from the input — verbatim.
- Analysis: tie security, business continuity (operations, payment
  processing, real-time reporting), compliance / legal, and customer
  implications to specific stats.
- BI Insights: 4–6 bullets surfacing patterns (credential-stuffing
  signal, regional concentration, MFA anomalies) and tradeoffs.
- Recommended Actions: numbered list of 4–6 steps tied to a stat or
  risk above (step-up auth, isolate clusters, customer comms, etc).

Constraints:
- Use only information present in the scenario. "not specified" for
  anything missing — never estimate.
- Cover credential stuffing, MFA, compliance / legal / disclosure
  obligations, Europe and North America scope, and business continuity
  tradeoffs.
- Tone: executive, concise, professional, clear.
- Title the report "Security BI Incident Report" and end with
  "Best regards, Security Operations Team".`,

  // Set 3 — Supply chain disruption (BI supply chain report)
  `You are a senior Business Analyst. Take the scenario the user provides
and produce a concise, professional BI-style supply chain report grounded
strictly in the input — no invented facts, names, or numbers.

Use these exact section headings, in this order:
1. Overview
2. Stats Snapshot
3. Analysis
4. BI Insights
5. Recommended Actions

Per-section rules:
- Overview: 2–3 sentences using only stated facts.
- Stats Snapshot: bullet every metric, percentage, week count, budget
  figure, supplier count, region, and deadline from the input — verbatim.
- Analysis: tie supplier, procurement, inventory, launch, and enterprise
  customer implications to specific stats.
- BI Insights: 4–6 bullets surfacing supplier concentration, financial
  exposure, launch-prioritization tradeoffs, and the 9-day decision window.
- Recommended Actions: numbered list of 4–6 steps (confirm timeline,
  fast-track alternates, finance exceptions, enterprise comms, scenario
  options to leadership).

Constraints:
- Use only information present in the scenario. "not specified" for
  anything missing — never estimate.
- Cover semiconductor supplier instability, launch delays, finance freeze,
  enterprise account pressure, and North America / Europe / Asia scope.
- Tone: executive, concise, professional, clear.
- Title the report "Supply Chain BI Report" and end with
  "Best regards, Supply Chain Analytics Team".`,
];

const IDEAL_PROMPTS: Record<number, string[]> = {
  2: ROUND_2,
  3: ROUND_3,
  4: ROUND_4,
  5: ROUND_5,
  6: ROUND_6,
};

export function getIdealPromptForRound(
  round: number,
  setIndex: number
): string | undefined {
  const variants = IDEAL_PROMPTS[round];
  if (!variants || variants.length === 0) return undefined;
  return variants[setIndex] ?? variants[0];
}

export function getIdealPromptsForSession(
  sessionId: string | undefined | null
): Record<number, string> {
  const result: Record<number, string> = {};
  for (const round of [2, 3, 4, 5, 6]) {
    const setIndex = sessionId ? getRoundSetIndex(sessionId, round) : 0;
    const prompt = getIdealPromptForRound(round, setIndex);
    if (prompt) result[round] = prompt;
  }
  return result;
}
