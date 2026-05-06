from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any, Optional

from PromptWars_Aetherion.lib.cache import cache_key, cache_get, cache_set
from PromptWars_Aetherion.lib.openai_client import get_openai
from PromptWars_Aetherion.lib.similarity import get_similarity
from PromptWars_Aetherion.lib.types import Round

LLM_TIMEOUT_S: float = float(
    os.environ.get("EVALUATOR_LLM_TIMEOUT_MS") or os.environ.get("OPENAI_TIMEOUT_MS") or 12_000
) / 1000

EXECUTION_SYSTEM_PROMPT = (
    "You are being evaluated in a prompt-engineering competition. "
    "Follow only the user's prompt and the provided input. "
    "Do not add sections, constraints, formatting, assumptions, or helpful structure unless they are explicitly requested. "
    "If the prompt is underspecified, respond conservatively rather than filling in missing requirements."
)

BASELINE_MARGIN_BY_TYPE: dict[str, float] = {
    "IMPROVE": 0.06,
    "REVERSE": 0.08,
    "OPTIMIZE": 0.05,
    "STRUCTURED": 0.06,
    "BONUS": 0.08,
}

BONUS_TARGET_OUTPUT = """Subject: Aurora Identity Migration - Status Update and Go/No-Go Recommendation

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
Program Lead, Aurora Identity Migration"""

BONUS_REQUIRED_SECTIONS = [
    "Executive Summary", "Current Status", "Root Cause Analysis",
    "Impact Assessment", "Decision Required", "Recovery Plan",
    "Revised Timeline", "Risk Mitigation", "Next Steps",
]

BONUS_PROMPT_CHECKS = [
    ("executive stakeholder email",
     lambda t: bool(re.search(r'\b(email|update|memo|status)\b', t, re.I)) and
               bool(re.search(r'\b(stakeholder|executive|leadership)\b', t, re.I))),
    ("subject line instruction", lambda t: bool(re.search(r'\bsubject\b', t, re.I))),
    ("explicit sections or headings",
     lambda t: _count_named_sections(t) >= 4 or
               bool(re.search(r'\b(section|heading|structured output|explicit sections?)\b', t, re.I))),
    ("quantified facts and dates",
     lambda t: bool(re.search(r'\b(exact|specific|quantified|numeric|numbers?|metrics|dates?)\b', t, re.I)) or
               bool(re.search(r'(38,?000|6,?200|71%|92%|99\.95%|180k|95k|47 strategic|may 15|june 9)', t, re.I))),
    ("timeline or milestone table",
     lambda t: bool(re.search(r'\b(table|timeline|milestone)\b', t, re.I))),
    ("risk mitigation and rollback",
     lambda t: bool(re.search(r'\b(risk|mitigation|rollback|fallback|monitoring)\b', t, re.I))),
    ("compliance and security requirements",
     lambda t: bool(re.search(r'\b(gdpr|compliance|security|mfa|retention)\b', t, re.I))),
    ("decision request and deadline",
     lambda t: bool(re.search(r'\b(decision|approve|go/?no-go|recommendation|deadline)\b', t, re.I)) or
               bool(re.search(r'\b(wednesday|4 ?pm)\b', t, re.I))),
    ("customer communications",
     lambda t: bool(re.search(r'\b(customer success|strategic accounts?|customer communication|outreach)\b', t, re.I))),
    ("phased rollout and maintenance window",
     lambda t: bool(re.search(r'\b(phased rollout|regional rollout|maintenance window|change freeze|cutover window)\b', t, re.I))),
    ("professional tone",
     lambda t: bool(re.search(r'\b(professional|clear|concise|executive tone)\b', t, re.I))),
]

BONUS_OUTPUT_FACT_CHECKS = [
    ("subject line", lambda t: bool(re.match(r'^subject:\s*aurora identity migration', t.strip(), re.I))),
    ("delay and revised cutover",
     lambda t: bool(re.search(r'\b3 weeks behind\b', t, re.I)) and
               bool(re.search(r'\bmay 15\b', t, re.I)) and
               bool(re.search(r'\bjune 9\b', t, re.I))),
    ("SCIM root cause and affected regions",
     lambda t: bool(re.search(r'\bokta\b', t, re.I)) and
               bool(re.search(r'\bscim\b', t, re.I)) and
               bool(re.search(r'\bschema change\b', t, re.I)) and
               bool(re.search(r'\bduplicate\w*\b', t, re.I)) and
               bool(re.search(r'\b4 of 12 regions\b', t, re.I))),
    ("account scope and regional coverage",
     lambda t: bool(re.search(r'38,?000', t)) and
               bool(re.search(r'6,?200', t)) and
               bool(re.search(r'\b(us|eu|apac)\b', t, re.I))),
    ("reliability and test metrics",
     lambda t: bool(re.search(r'99\.95%', t)) and
               bool(re.search(r'\b9\s+sev-2\b', t, re.I)) and
               bool(re.search(r'71%', t)) and bool(re.search(r'92%', t))),
    ("compliance and security requirements",
     lambda t: bool(re.search(r'\bgdpr\b', t, re.I)) and
               bool(re.search(r'\beu\b', t, re.I)) and
               bool(re.search(r'\blog retention\b', t, re.I)) and
               bool(re.search(r'\bmfa\b', t, re.I))),
    ("budget and consultant tradeoff",
     lambda t: bool(re.search(r'\b180k\b', t, re.I)) and
               bool(re.search(r'\b95k\b', t, re.I)) and
               bool(re.search(r'\bconsultant\b', t, re.I))),
    ("customer communication scope",
     lambda t: bool(re.search(r'\b47 strategic accounts?\b', t, re.I)) or
               (bool(re.search(r'\b47\b', t)) and bool(re.search(r'\bcustomer', t, re.I)))),
    ("decision deadline and maintenance window",
     lambda t: bool(re.search(r'\bwednesday\b', t, re.I)) and
               bool(re.search(r'\b4 ?pm\b', t, re.I)) and
               bool(re.search(r'\bsaturday\b', t, re.I)) and
               bool(re.search(r'\b10 ?pm\b', t, re.I)) and
               bool(re.search(r'\b2 ?am\b', t, re.I))),
    ("phased rollout recommendation", lambda t: bool(re.search(r'\bphased rollout\b', t, re.I))),
    ("timeline table",
     lambda t: bool(re.search(r'\|.*milestone.*original date.*revised date.*\|', t, re.I)) or
               (bool(re.search(r'\bmilestone\b', t, re.I)) and bool(re.search(r'\brevised date\b', t, re.I)))),
    ("checklist-style next steps",
     lambda t: bool(re.search(r'\[[ xX]?\]', t)) or bool(re.search(r'\bnext steps:\b', t, re.I))),
]

BONUS_EMAIL_STRUCTURE_CHECKS = [
    ("salutation", lambda t: bool(re.search(r'\bdear stakeholders\b', t, re.I))),
    ("closing", lambda t: bool(re.search(r'\b(best regards|regards|sincerely)\b', t, re.I))),
    ("multiple paragraphs",
     lambda t: len([p for p in re.split(r'\n\s*\n', t) if p.strip()]) >= 4),
    ("table formatting", lambda t: bool(re.search(r'\|.+\|', t))),
    ("checklist formatting", lambda t: bool(re.search(r'\[[ xX]?\]', t))),
]

PROMPT_CONSTRAINT_WORDS = re.compile(
    r'\b(must|should|only|exactly|format|structure|include|exclude|limit|max|minimum|step|json|xml|list|table|brief|detailed|concise)\b',
    re.I,
)
PROMPT_ACTION_WORDS = re.compile(
    r'\b(explain|describe|write|analyze|summarize|list|compare|generate|extract|identify|classify|convert|translate|create|output)\b',
    re.I,
)
ANALOGY_MARKERS = re.compile(
    r'\b(like|similar to|just as|think of|imagine|as if|metaphor|analogy|resembles|compared to|in the same way|picture|envision)\b',
    re.I,
)
REASONING_CONNECTORS = re.compile(
    r'\b(because|therefore|thus|hence|since|given that|as a result|consequently|first|second|third|finally|in conclusion|step \d)\b',
    re.I,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _clamp(n: float) -> float:
    if n != n:  # NaN
        return 0.0
    return min(1.0, max(0.0, n))


def _score_checks(text: str, checks: list) -> float:
    normalized = text.strip()
    if not normalized:
        return 0.0
    matched = sum(1 for _, test in checks if test(normalized))
    return 1.0 if not checks else matched / len(checks)


def _count_named_sections(text: str) -> int:
    lower = text.lower()
    return sum(1 for s in BONUS_REQUIRED_SECTIONS if s.lower() in lower)


def _score_named_sections(text: str) -> float:
    if not BONUS_REQUIRED_SECTIONS:
        return 1.0
    return _count_named_sections(text) / len(BONUS_REQUIRED_SECTIONS)


def _score_prompt(prompt: str) -> float:
    words = [w for w in prompt.strip().split() if w]
    n = len(words)
    if n == 0:
        return 0.0
    score = 0.0
    if 5 <= n <= 60:
        score += 0.4
    elif 0 < n < 5:
        score += 0.1
    else:
        score += 0.2
    if PROMPT_CONSTRAINT_WORDS.search(prompt):
        score += 0.3
    if PROMPT_ACTION_WORDS.search(prompt):
        score += 0.3
    return min(1.0, score)


def _score_analogy(output: str) -> float:
    words = len([w for w in output.strip().split() if w])
    if words < 10:
        return 0.1
    length_bonus = min(0.3, words / 80)
    return 0.7 + length_bonus if ANALOGY_MARKERS.search(output) else 0.1 + length_bonus


def _score_reasoning(output: str) -> float:
    words = len([w for w in output.strip().split() if w])
    if words < 10:
        return 0.0
    score = 0.0
    if REASONING_CONNECTORS.search(output):
        score += 0.4
    if re.search(r'\b\d+\.|\b[a-z]\)', output):
        score += 0.3
    if words >= 30:
        score += 0.3
    return min(1.0, score)


def _get_brevity_score(prompt: str) -> float:
    words = len([w for w in prompt.strip().split() if w])
    if words > 15:
        return 0.0
    return 1.0 - (words / 15) * 0.5


def _evaluate_structure(output: str) -> float:
    bullets = len(re.findall(r'[-*]\s+', output))
    numbered = len(re.findall(r'\b\d+\.', output))
    headings = len(re.findall(r'^#{1,6}\s+', output, re.MULTILINE))
    paragraphs = len([p for p in re.split(r'\n\n+', output) if p.strip()])
    return min(1.0, (bullets * 0.2 + numbered * 0.3 + headings * 0.3 + paragraphs * 0.2) / 4)


def _check_constraints(constraints: Any, user_prompt: str, output: str) -> float:
    if constraints is None:
        return 1.0
    if isinstance(constraints, list):
        if not constraints:
            return 1.0
        met = sum(1 for item in constraints if isinstance(item, str) and item.lower() in output.lower())
        return met / len(constraints)
    if not isinstance(constraints, dict):
        return 1.0
    score = 0
    total = 0
    if constraints.get("maxWords") is not None:
        total += 1
        if len([w for w in output.split() if w]) <= constraints["maxWords"]:
            score += 1
    if constraints.get("requiredSections"):
        total += 1
        lower_out = output.lower()
        if all(s.lower() in lower_out for s in constraints["requiredSections"]):
            score += 1
    if constraints.get("requireSteps"):
        total += 1
        if re.search(r'step', output, re.I) or re.search(r'\b1\.|\b2\.', output) or re.search(r'first', output, re.I):
            score += 1
    if constraints.get("mustInclude"):
        total += 1
        if all(w.lower() in output.lower() for w in constraints["mustInclude"]):
            score += 1
    if constraints.get("mustExclude"):
        total += 1
        if not any(w.lower() in output.lower() for w in constraints["mustExclude"]):
            score += 1
    return 1.0 if total == 0 else score / total


# ── LLM calls ────────────────────────────────────────────────────────────────

async def _call_llm(coro, timeout_s: float = LLM_TIMEOUT_S):
    return await asyncio.wait_for(coro, timeout=timeout_s)


async def _score_combined(user_prompt: str, output: str) -> dict:
    key = cache_key("combined", user_prompt, output)
    cached = cache_get(key)
    if cached:
        return cached

    try:
        res = await _call_llm(
            get_openai().chat.completions.create(
                model="gpt-4o-mini",
                temperature=0,
                messages=[
                    {
                        "role": "system",
                        "content": 'You are a scoring engine.\n\nReturn JSON only — no markdown, no explanation:\n{\n  "quality": number,\n  "analogy": number,\n  "prompt": number\n}\nScore each from 0 to 1.',
                    },
                    {"role": "user", "content": f"Prompt:\n{user_prompt}\n\nOutput:\n{output}"},
                ],
                response_format={"type": "json_object"},
            )
        )
        text = (res.choices[0].message.content or "{}").strip()
        parsed = json.loads(text)
        scores = {
            "quality": _clamp(float(parsed.get("quality", 0))),
            "analogy": _clamp(float(parsed.get("analogy", 0))),
            "prompt": _clamp(float(parsed.get("prompt", 0))),
        }
    except Exception:
        scores = {"quality": 0.5, "analogy": _score_analogy(output), "prompt": _score_prompt(user_prompt)}

    cache_set(key, scores)
    return scores


async def _run_prompt_with_context(prompt: str, input_text: Optional[str] = None, input_label: str = "Input") -> str:
    content = f"{prompt}\n\n{input_label}:\n{input_text}" if input_text and input_text.strip() else prompt
    completion = await _call_llm(
        get_openai().chat.completions.create(
            model="gpt-4o-mini",
            temperature=0,
            messages=[
                {"role": "system", "content": EXECUTION_SYSTEM_PROMPT},
                {"role": "user", "content": content},
            ],
        )
    )
    return completion.choices[0].message.content or ""


# ── Baseline gates ────────────────────────────────────────────────────────────

async def _get_or_compute_cached(key: str, compute):
    cached = cache_get(key)
    if cached is not None:
        return cached
    value = await compute()
    cache_set(key, value)
    return value


def _score_baseline_gate(candidate_score: float, baseline_score: float, round_type: str) -> dict:
    margin = BASELINE_MARGIN_BY_TYPE.get(round_type, 0.06)
    threshold_score = min(0.98, baseline_score + margin)
    if candidate_score >= threshold_score:
        return {"baselineGateScore": 1.0, "baselineScore": baseline_score,
                "thresholdScore": threshold_score, "beatBaseline": True, "margin": margin}
    gate_score = _clamp(candidate_score / max(threshold_score, 1e-6)) * 0.35
    return {"baselineGateScore": gate_score, "baselineScore": baseline_score,
            "thresholdScore": threshold_score, "beatBaseline": False, "margin": margin}


# ── Scoring helpers per round type ────────────────────────────────────────────

async def _score_improve_outcome(round_: Round, prompt: str, output: str) -> dict:
    combined = await _score_combined(prompt, output)
    quality_score = combined["quality"]
    prompt_score = combined["prompt"]
    constraint_score = _check_constraints(round_.constraints, prompt, output)
    similarity_score = await get_similarity(output, round_.expectedOutput) if round_.expectedOutput else 1.0
    task_output_score = 0.45 * quality_score + 0.3 * similarity_score + 0.25 * constraint_score
    return {
        "qualityScore": quality_score, "similarityScore": similarity_score,
        "promptScore": prompt_score, "constraintScore": constraint_score,
        "taskOutputScore": task_output_score,
    }


async def _score_reverse_outcome(round_: Round, prompt: str, output: str) -> dict:
    target = round_.expectedOutput or ""
    similarity, prompt_score = await asyncio.gather(
        get_similarity(output, target),
        asyncio.coroutine(lambda: _score_prompt(prompt))() if False else asyncio.sleep(0),
    )
    # fix: run synchronously
    similarity = await get_similarity(output, target)
    prompt_score = _score_prompt(prompt)
    constraint_score = _check_constraints(round_.constraints, prompt, output)
    task_output_score = 0.8 * similarity + 0.2 * constraint_score
    return {
        "similarity": similarity, "promptScore": prompt_score,
        "constraintScore": constraint_score, "taskOutputScore": task_output_score,
    }


async def _score_optimize_outcome(round_: Round, prompt: str, output: str) -> dict:
    brevity_score = _get_brevity_score(prompt)
    combined = await _score_combined(prompt, output)
    quality_score = combined["quality"]
    analogy_quality_score = combined["analogy"]
    p_score = combined["prompt"]
    task_output_score = 0.55 * quality_score + 0.45 * analogy_quality_score
    prompt_craft_score = 0.6 * brevity_score + 0.4 * p_score
    return {
        "brevityScore": brevity_score, "qualityScore": quality_score,
        "analogyQualityScore": analogy_quality_score, "promptScore": p_score,
        "promptCraftScore": prompt_craft_score, "taskOutputScore": task_output_score,
    }


async def _score_structured_outcome(round_: Round, prompt: str, output: str) -> dict:
    reasoning_score = _score_reasoning(output)
    structure_score = _evaluate_structure(output)
    prompt_score = _score_prompt(prompt)
    constraint_score = _check_constraints(round_.constraints, prompt, output)
    task_output_score = 0.45 * reasoning_score + 0.35 * structure_score + 0.2 * constraint_score
    return {
        "reasoningScore": reasoning_score, "structureScore": structure_score,
        "promptScore": prompt_score, "constraintScore": constraint_score,
        "taskOutputScore": task_output_score,
    }


async def _score_bonus_output(final_output: str) -> dict:
    output_coverage = _clamp(
        0.45 * _score_named_sections(final_output) +
        0.35 * _score_checks(final_output, BONUS_OUTPUT_FACT_CHECKS) +
        0.2 * _score_checks(final_output, BONUS_EMAIL_STRUCTURE_CHECKS)
    )
    output_structure = _clamp(
        0.5 * _score_checks(final_output, BONUS_EMAIL_STRUCTURE_CHECKS) +
        0.5 * _evaluate_structure(final_output)
    )
    similarity = await get_similarity(final_output, BONUS_TARGET_OUTPUT)
    task_output_score = 0.5 * output_coverage + 0.3 * output_structure + 0.2 * similarity
    return {
        "outputCoverageScore": output_coverage,
        "outputStructureScore": output_structure,
        "similarityScore": similarity,
        "taskOutputScore": task_output_score,
    }


# ── Baseline fetchers ─────────────────────────────────────────────────────────

async def _get_improve_baseline(round_: Round) -> dict:
    bp = (round_.originalPrompt or "").strip() or "Summarize this."
    key = cache_key("baseline", "IMPROVE", bp, round_.input or "", round_.expectedOutput or "")
    async def compute():
        out = await _run_prompt_with_context(bp, round_.input, "Source Text")
        scored = await _score_improve_outcome(round_, bp, out)
        return {"baselinePrompt": bp, "baselineOutput": out, "baselineScore": scored["taskOutputScore"]}
    return await _get_or_compute_cached(key, compute)


async def _get_reverse_baseline(round_: Round) -> dict:
    example = (round_.expectedOutput or "").strip()
    bp = (f"Use the example below as inspiration to generate a startup brief in a similar format.\n\nExample:\n{example}"
          if example else "Write a structured startup idea.")
    key = cache_key("baseline", "REVERSE", bp, round_.expectedOutput or "")
    async def compute():
        out = await _run_prompt_with_context(bp)
        scored = await _score_reverse_outcome(round_, bp, out)
        return {"baselinePrompt": bp, "baselineOutput": out, "baselineScore": scored["taskOutputScore"]}
    return await _get_or_compute_cached(key, compute)


async def _get_optimize_baseline(round_: Round) -> dict:
    bp = (round_.input or "").strip() or "Explain this simply using an analogy."
    key = cache_key("baseline", "OPTIMIZE", bp, round_.input or "", round_.expectedOutput or "")
    async def compute():
        out = await _run_prompt_with_context(bp, round_.input, "Task")
        scored = await _score_optimize_outcome(round_, bp, out)
        return {"baselinePrompt": bp, "baselineOutput": out, "baselineScore": scored["taskOutputScore"]}
    return await _get_or_compute_cached(key, compute)


async def _get_structured_baseline(round_: Round) -> dict:
    bp = "Solve this problem."
    key = cache_key("baseline", "STRUCTURED", bp, round_.input or "", round_.expectedOutput or "")
    async def compute():
        out = await _run_prompt_with_context(bp, round_.input, "Problem")
        scored = await _score_structured_outcome(round_, bp, out)
        return {"baselinePrompt": bp, "baselineOutput": out, "baselineScore": scored["taskOutputScore"]}
    return await _get_or_compute_cached(key, compute)


async def _get_bonus_baseline(base_prompt: str) -> dict:
    bp_meta = "Write a prompt that turns the scenario into an executive stakeholder update."
    key = cache_key("baseline", "BONUS", bp_meta, base_prompt)
    async def compute():
        compiled = await compile_meta_prompt(meta_prompt=bp_meta, base_prompt=base_prompt)
        out = await _run_prompt_with_context(compiled, base_prompt, "Scenario")
        scored = await _score_bonus_output(out)
        return {"baselineMetaPrompt": bp_meta, "baselineCompiledPrompt": compiled,
                "baselineOutput": out, "baselineScore": scored["taskOutputScore"]}
    return await _get_or_compute_cached(key, compute)


# ── Per-round evaluators ──────────────────────────────────────────────────────

async def _evaluate_improve_round(round_: Round, user_prompt: str) -> dict:
    output = await _run_prompt_with_context(user_prompt, round_.input, "Source Text")
    scored = await _score_improve_outcome(round_, user_prompt, output)
    baseline = await _get_improve_baseline(round_)
    gate = _score_baseline_gate(scored["taskOutputScore"], baseline["baselineScore"], "IMPROVE")
    final_score = 0.45 * scored["taskOutputScore"] + 0.25 * scored["promptScore"] + 0.3 * gate["baselineGateScore"]
    return {**scored, **gate, "output": output,
            "baselinePrompt": baseline["baselinePrompt"], "baselineOutput": baseline["baselineOutput"],
            "finalScore": final_score, "progress": round(final_score * 100)}


async def _evaluate_reverse_round(round_: Round, user_prompt: str) -> dict:
    output = await _run_prompt_with_context(user_prompt)
    scored = await _score_reverse_outcome(round_, user_prompt, output)
    baseline = await _get_reverse_baseline(round_)
    gate = _score_baseline_gate(scored["taskOutputScore"], baseline["baselineScore"], "REVERSE")
    final_score = 0.45 * scored["taskOutputScore"] + 0.25 * scored["promptScore"] + 0.3 * gate["baselineGateScore"]
    return {**scored, **gate, "output": output, "recoveredPrompt": user_prompt,
            "baselinePrompt": baseline["baselinePrompt"], "baselineOutput": baseline["baselineOutput"],
            "finalScore": final_score, "progress": round(final_score * 100)}


async def _evaluate_optimize_round(round_: Round, user_prompt: str) -> dict:
    brevity = _get_brevity_score(user_prompt)
    if brevity == 0:
        return {"finalScore": 0.0, "progress": 0, "reason": "Prompt exceeds 15 words"}
    output = await _run_prompt_with_context(user_prompt, round_.input, "Task")
    scored = await _score_optimize_outcome(round_, user_prompt, output)
    baseline = await _get_optimize_baseline(round_)
    gate = _score_baseline_gate(scored["taskOutputScore"], baseline["baselineScore"], "OPTIMIZE")
    final_score = 0.4 * scored["taskOutputScore"] + 0.3 * scored["promptCraftScore"] + 0.3 * gate["baselineGateScore"]
    return {**scored, **gate, "output": output,
            "baselinePrompt": baseline["baselinePrompt"], "baselineOutput": baseline["baselineOutput"],
            "finalScore": final_score, "progress": round(final_score * 100)}


def _evaluate_classify_round(round_: Round, answers: dict[str, str]) -> dict:
    parts = round_.promptParts or []
    if not parts:
        return {"correct": 0, "total": 0, "finalScore": 0.0, "progress": 0}
    correct = sum(1 for p in parts if answers.get(p.id) == p.answer)
    score = correct / len(parts)
    return {"correct": correct, "total": len(parts), "finalScore": score, "progress": round(score * 100)}


async def _evaluate_structured_round(round_: Round, user_prompt: str) -> dict:
    output = await _run_prompt_with_context(user_prompt, round_.input, "Problem")
    scored = await _score_structured_outcome(round_, user_prompt, output)
    baseline = await _get_structured_baseline(round_)
    gate = _score_baseline_gate(scored["taskOutputScore"], baseline["baselineScore"], "STRUCTURED")
    final_score = 0.45 * scored["taskOutputScore"] + 0.25 * scored["promptScore"] + 0.3 * gate["baselineGateScore"]
    return {**scored, **gate, "output": output,
            "baselinePrompt": baseline["baselinePrompt"], "baselineOutput": baseline["baselineOutput"],
            "finalScore": final_score, "progress": round(final_score * 100)}


def _score_bonus_prompt_coverage(prompt: str) -> float:
    return _clamp(
        0.65 * _score_checks(prompt, BONUS_PROMPT_CHECKS) +
        0.35 * _score_named_sections(prompt)
    )


# ── Public API ────────────────────────────────────────────────────────────────

async def compile_meta_prompt(*, meta_prompt: str, base_prompt: str) -> str:
    nm = meta_prompt.strip()
    nb = base_prompt.strip()
    if not nm:
        raise ValueError("Meta prompt is required")

    key = cache_key("bonus-compile", nm, nb)
    cached = cache_get(key)
    if cached is not None:
        return str(cached)

    completion = await _call_llm(
        get_openai().chat.completions.create(
            model="gpt-4o-mini",
            temperature=0,
            messages=[
                {
                    "role": "system",
                    "content": "You are a prompt compiler for a prompt-engineering game. You must return only the improved prompt that should later be run against the scenario. Do not solve the scenario. Do not explain your reasoning. Do not wrap the output in markdown fences.",
                },
                {
                    "role": "user",
                    "content": f"Meta-prompt:\n{nm}\n\nScenario:\n{nb}\n\nReturn only the compiled prompt that should be executed later against the same scenario.",
                },
            ],
        )
    )
    compiled = (completion.choices[0].message.content or "").strip()
    compiled = re.sub(r'^```(?:text|markdown)?\s*', '', compiled, flags=re.I)
    compiled = re.sub(r'\s*```$', '', compiled).strip()
    cache_set(key, compiled)
    return compiled


async def evaluate_meta_bonus_round(*, meta_prompt: str, base_prompt: str) -> dict:
    try:
        if not meta_prompt:
            return {"finalScore": 0.0, "progress": 0, "error": "Meta prompt is required"}

        compiled_prompt = await compile_meta_prompt(meta_prompt=meta_prompt, base_prompt=base_prompt)
        final_output = await _run_prompt_with_context(compiled_prompt, base_prompt, "Scenario")
        meta_coverage = _score_bonus_prompt_coverage(meta_prompt)
        compiled_coverage = _score_bonus_prompt_coverage(compiled_prompt)
        output_scores = await _score_bonus_output(final_output)
        baseline = await _get_bonus_baseline(base_prompt)
        gate = _score_baseline_gate(output_scores["taskOutputScore"], baseline["baselineScore"], "BONUS")

        final_score = (
            0.3 * meta_coverage +
            0.3 * compiled_coverage +
            0.1 * output_scores["outputCoverageScore"] +
            0.1 * output_scores["outputStructureScore"] +
            0.05 * output_scores["similarityScore"] +
            0.15 * gate["baselineGateScore"]
        )

        return {
            "compiledPrompt": compiled_prompt,
            "finalOutput": final_output,
            "scores": {
                "metaCoverageScore": meta_coverage,
                "compiledPromptCoverageScore": compiled_coverage,
                "outputCoverageScore": output_scores["outputCoverageScore"],
                "outputStructureScore": output_scores["outputStructureScore"],
                "similarityScore": output_scores["similarityScore"],
            },
            **output_scores,
            **gate,
            "baselineMetaPrompt": baseline["baselineMetaPrompt"],
            "baselineCompiledPrompt": baseline["baselineCompiledPrompt"],
            "baselineOutput": baseline["baselineOutput"],
            "finalScore": final_score,
            "progress": round(final_score * 100),
        }
    except Exception as e:
        print(f"[evaluator] Meta Bonus Evaluation Error: {e}")
        return {"finalScore": 0.0, "progress": 0, "error": "Evaluation failed"}


async def evaluate_round(round_: Round, user_prompt: str, answers: Optional[dict] = None) -> dict:
    if round_.type == "IMPROVE":
        return await _evaluate_improve_round(round_, user_prompt)
    elif round_.type == "REVERSE":
        return await _evaluate_reverse_round(round_, user_prompt)
    elif round_.type == "OPTIMIZE":
        return await _evaluate_optimize_round(round_, user_prompt)
    elif round_.type == "STRUCTURED":
        return await _evaluate_structured_round(round_, user_prompt)
    elif round_.type == "CLASSIFY":
        return _evaluate_classify_round(round_, answers or {})
    else:
        raise ValueError(f"Unknown round type: {round_.type}")
