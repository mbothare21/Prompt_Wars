import "server-only";

import { buildCrossRoundCoachingSummary, collapseAttemptsToRoundScores } from "@/lib/coachingSummary";
import { getIdealPromptsForSession } from "@/lib/idealPrompts";
import type { AdminPlayerExport } from "@/lib/adminPlayers";

const ROUND_TYPE_NAMES = {
  CLASSIFY: "Classification",
  IMPROVE: "Prompt Improvement",
  REVERSE: "Reverse Engineering",
  OPTIMIZE: "Optimization",
  STRUCTURED: "Structured Output",
  BONUS: "Bonus Challenge",
} as const;

const ROUND_TYPE_LABELS: Record<number, string> = {
  1: ROUND_TYPE_NAMES.CLASSIFY,
  2: ROUND_TYPE_NAMES.IMPROVE,
  3: ROUND_TYPE_NAMES.REVERSE,
  4: ROUND_TYPE_NAMES.OPTIMIZE,
  5: ROUND_TYPE_NAMES.STRUCTURED,
  6: ROUND_TYPE_NAMES.BONUS,
};

const IMPROVEMENT_TIPS_HTML: Record<string, string> = {
  [ROUND_TYPE_NAMES.CLASSIFY]: "Focus on specific classification boundaries — avoid over-generalising labels.",
  [ROUND_TYPE_NAMES.IMPROVE]: "Add explicit constraints and clear structure to guide the model more precisely.",
  [ROUND_TYPE_NAMES.REVERSE]: "Work backwards from the expected output to identify the key prompt patterns.",
  [ROUND_TYPE_NAMES.OPTIMIZE]: "Prioritise information density — keep the prompt self-contained, named, and under the word cap.",
  [ROUND_TYPE_NAMES.STRUCTURED]: "Follow every format requirement exactly as specified — no extra sections.",
  [ROUND_TYPE_NAMES.BONUS]: "State exactly what the generated prompt should make the AI do and what the final answer should look like.",
};

const GAME_STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  COMPLETED_WITH_BONUS: "Completed + Bonus",
  COMPLETED_BONUS: "Completed + Bonus",
  FAILED: "Failed (Attempts)",
  TIME_OVER: "Time Out",
  DISQUALIFIED: "Disqualified (Violations)",
};

type ClassifyDetail = {
  id: string;
  text: string;
  chosen: string | null;
  correct: string;
  isCorrect: boolean;
};

type ClassifyOutput = {
  correct: number;
  total: number;
  details: ClassifyDetail[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeText(value: string): string {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatPrompt(prompt: unknown): string {
  if (typeof prompt === "string") return prompt;
  if (prompt && typeof prompt === "object") {
    return Object.entries(prompt as Record<string, string>)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
  }
  return "N/A";
}

function parseClassifyOutput(output: string | undefined): ClassifyOutput | null {
  try {
    return output ? (JSON.parse(output) as ClassifyOutput) : null;
  } catch {
    return null;
  }
}

export function buildReportFilename(player: AdminPlayerExport): string {
  const base = (player.email || player.name || "player-report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "player-report"}-prompt-wars-response-report.html`;
}

export function buildPlayerReportHtml(
  player: AdminPlayerExport,
  tips: Record<number, string> | undefined,
  sessionId: string | null | undefined
): string {
  const idealPrompts = sessionId ? getIdealPromptsForSession(sessionId) : {};

  const timeTakenSec =
    player.timeTaken > 10000 ? Math.round(player.timeTaken / 1000) : player.timeTaken;
  const statusLabel =
    GAME_STATUS_LABELS[player.gameStatus ?? ""] ?? player.gameStatus ?? "Unknown";

  const sortedRounds = [...(player.rounds || [])].sort(
    (a, b) => a.round - b.round || (a.attempts ?? 0) - (b.attempts ?? 0)
  );
  const summaryRounds = collapseAttemptsToRoundScores(
    sortedRounds.map((round) => ({
      round: round.round,
      score: round.score,
      attempts: round.attempts,
    }))
  );
  const coachingSummary = buildCrossRoundCoachingSummary(summaryRounds);

  let roundsHtml = "";

  // ── Round 1 (CLASSIFY) — grouped section ─────────────────────────────────
  const r1Entries = sortedRounds.filter((r) => r.round === 1);
  const otherRounds = sortedRounds.filter((r) => r.round !== 1);

  if (r1Entries.length > 0) {
    const singleAttempt = r1Entries.length === 1;
    const r1Label = ROUND_TYPE_LABELS[1] ?? "Classification";
    const r1Tip =
      tips?.[1] ?? IMPROVEMENT_TIPS_HTML[r1Label] ?? "Review classification boundaries carefully.";
    const worstPct = Math.round(Math.min(...r1Entries.map((r) => r.score)) * 100);
    const r1ScoreColor = worstPct >= 70 ? "#16a34a" : "#dc2626";

    const allAttemptsHtml = r1Entries
      .map((attemptEntry, idx) => {
        const parsed = parseClassifyOutput(attemptEntry.output);
        const pct = Math.round(attemptEntry.score * 100);
        const passed = pct >= 100;
        let choicesHtml = "";
        if (parsed?.details?.length) {
          choicesHtml = parsed.details
            .map(
              (d: ClassifyDetail) => `
            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:4px;padding:6px 8px;border-radius:4px;background:${d.isCorrect ? "#f0fdf4" : "#fef2f2"};border:1px solid ${d.isCorrect ? "#bbf7d0" : "#fecaca"};">
              <span style="font-size:12px;flex-shrink:0;margin-top:1px;">${d.isCorrect ? "&#10003;" : "&#10007;"}</span>
              <div style="flex:1;min-width:0;">
                <div style="font-size:11px;color:#64748b;margin-bottom:2px;">${escapeText(d.text)}</div>
                <div style="font-size:12px;">
                  <span style="color:${d.isCorrect ? "#15803d" : "#b91c1c"};font-weight:600;">${escapeText(d.chosen ?? "No answer")}</span>
                  ${!d.isCorrect ? ` <span style="color:#94a3b8;font-size:11px;">&rarr; Correct: <strong style="color:#15803d;">${escapeText(d.correct)}</strong></span>` : ""}
                </div>
              </div>
            </div>`
            )
            .join("");
        } else {
          choicesHtml = `<pre style="background:#0f172a;color:#e2e8f0;padding:10px;border-radius:5px;font-size:11px;white-space:pre-wrap;word-wrap:break-word;margin:0;">${escapeText(formatPrompt(attemptEntry.prompt))}</pre>`;
        }
        return `
          <div style="border:1px solid ${passed ? "#bbf7d0" : "#fecaca"};border-radius:6px;padding:12px;margin-bottom:8px;background:${passed ? "#f0fdf4" : "#fff5f5"};">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-size:12px;font-weight:700;color:${passed ? "#15803d" : "#dc2626"};">Attempt ${idx + 1}</span>
              <span style="font-size:12px;font-weight:700;color:${pct >= 70 ? "#16a34a" : "#dc2626"};">${pct}%</span>
            </div>
            ${choicesHtml}
          </div>`;
      })
      .join("");

    roundsHtml += `
      <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px;background:#f8fafc;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">
          <h3 style="margin:0;color:#0891b2;font-size:14px;">Round 1: ${r1Label}</h3>
          <div style="display:flex;gap:12px;font-size:12px;color:#64748b;align-items:center;">
            <span>Worst Score: <strong style="color:${r1ScoreColor}">${worstPct}%</strong></span>
            <span>Attempts: <strong>${r1Entries.length}</strong></span>
            ${singleAttempt && worstPct >= 100 ? '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:700;border:1px solid #bbf7d0;">First Attempt Pass</span>' : ""}
          </div>
        </div>
        ${allAttemptsHtml}
        ${r1Tip ? `
        <div style="margin-top:8px;">
          <div style="font-size:11px;color:#b45309;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Why It Fell Short</div>
          <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:12px;font-size:12px;color:#78350f;line-height:1.6;white-space:pre-wrap;">${r1Tip}</div>
        </div>` : ""}
      </div>`;
  }

  // ── Rounds 2–6 — group by round number ───────────────────────────────────
  const otherRoundGroups = new Map<number, typeof otherRounds>();
  for (const r of otherRounds) {
    const group = otherRoundGroups.get(r.round) ?? [];
    group.push(r);
    otherRoundGroups.set(r.round, group);
  }

  for (const [roundNum, roundAttempts] of Array.from(otherRoundGroups.entries()).sort(
    ([a], [b]) => a - b
  )) {
    const sortedAttempts = [...roundAttempts].sort(
      (a, b) => (a.attempts ?? 0) - (b.attempts ?? 0)
    );
    const finalAttempt = sortedAttempts[sortedAttempts.length - 1];
    const totalAttempts = sortedAttempts.length;
    const finalPct = Math.round(finalAttempt.score * 100);
    const label = ROUND_TYPE_LABELS[roundNum] ?? "Unknown";
    const tip =
      tips?.[roundNum] ?? IMPROVEMENT_TIPS_HTML[label] ?? "Review the round instructions carefully.";
    const finalScoreColor = finalPct >= 70 ? "#16a34a" : finalPct >= 50 ? "#d97706" : "#dc2626";

    if (roundNum === 6) {
      const bonusPrompt = finalAttempt.prompt as
        | { metaPrompt?: string; compiledPrompt?: string }
        | null;
      const metaPromptText =
        typeof bonusPrompt === "object" && bonusPrompt?.metaPrompt
          ? bonusPrompt.metaPrompt
          : formatPrompt(finalAttempt.prompt);
      const compiledPromptText =
        typeof bonusPrompt === "object" && bonusPrompt?.compiledPrompt
          ? bonusPrompt.compiledPrompt
          : null;
      const bonusTip =
        tips?.[6] ??
        IMPROVEMENT_TIPS_HTML[ROUND_TYPE_NAMES.BONUS] ??
        "State exactly what the generated prompt should make the AI do and what the final answer should look like.";
      roundsHtml += `
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px;background:#f8fafc;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">
            <h3 style="margin:0;color:#7c3aed;font-size:14px;">Round 6: ${label} (Bonus)</h3>
            <div style="display:flex;gap:16px;font-size:12px;color:#64748b;align-items:center;">
              <span>Score: <strong style="color:${finalScoreColor}">${finalPct}%</strong></span>
              <span>Attempts: <strong>1</strong></span>
            </div>
          </div>
          <div style="margin-bottom:8px;">
            <div style="font-size:11px;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Meta-Prompt (written by player)</div>
            <pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:6px;font-size:12px;white-space:pre-wrap;word-wrap:break-word;margin:0;max-height:250px;overflow-y:auto;">${escapeText(metaPromptText)}</pre>
          </div>
          ${compiledPromptText ? `
          <div style="margin-bottom:8px;">
            <div style="font-size:11px;color:#0891b2;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Generated Prompt (compiled by AI from meta-prompt)</div>
            <pre style="background:#0c1a2e;color:#93c5fd;padding:12px;border-radius:6px;font-size:12px;white-space:pre-wrap;word-wrap:break-word;margin:0;max-height:250px;overflow-y:auto;border:1px solid #1e3a5f;">${escapeText(compiledPromptText)}</pre>
          </div>` : ""}
          ${finalAttempt.output ? `
          <div style="margin-bottom:8px;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">AI Output</div>
            <pre style="background:#f0fdf4;color:#14532d;padding:12px;border-radius:6px;font-size:12px;white-space:pre-wrap;word-wrap:break-word;margin:0;max-height:300px;overflow-y:auto;border:1px solid #bbf7d0;">${escapeText(finalAttempt.output)}</pre>
          </div>` : ""}
          <div style="margin-top:8px;">
            <div style="font-size:11px;color:#b45309;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Why It Fell Short</div>
            <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:12px;font-size:12px;color:#78350f;line-height:1.6;white-space:pre-wrap;">${bonusTip}</div>
          </div>
          ${idealPrompts[6] ? `
          <div style="margin-top:8px;">
            <div style="font-size:11px;color:#0e7490;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Ideal Meta-Prompt (reference)</div>
            <pre style="background:#ecfeff;border:1px solid #67e8f9;border-radius:6px;padding:12px;font-size:12px;color:#155e75;line-height:1.6;white-space:pre-wrap;word-wrap:break-word;margin:0;max-height:360px;overflow-y:auto;">${escapeHtml(idealPrompts[6])}</pre>
          </div>` : ""}
        </div>`;
      continue;
    }

    // Rounds 2–5: show every attempt as a numbered card
    const attemptsCardsHtml = sortedAttempts
      .map((attempt, idx) => {
        const aPct = Math.round(attempt.score * 100);
        const aColor = aPct >= 70 ? "#16a34a" : aPct >= 50 ? "#d97706" : "#dc2626";
        const aBorderColor = aPct >= 70 ? "#bbf7d0" : aPct >= 50 ? "#fde68a" : "#fecaca";
        const aBgColor = aPct >= 70 ? "#f0fdf4" : aPct >= 50 ? "#fffbeb" : "#fff5f5";
        const isLast = idx === sortedAttempts.length - 1;
        return `
          <div style="border:1px solid ${aBorderColor};border-radius:6px;padding:12px;margin-bottom:8px;background:${aBgColor};">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-size:12px;font-weight:700;color:${aColor};">Attempt ${idx + 1}${isLast && totalAttempts > 1 ? " (Final)" : ""}</span>
              <span style="font-size:12px;font-weight:700;color:${aColor};">${aPct}%</span>
            </div>
            <div style="margin-bottom:6px;">
              <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Prompt</div>
              <pre style="background:#0f172a;color:#e2e8f0;padding:10px;border-radius:5px;font-size:11px;white-space:pre-wrap;word-wrap:break-word;margin:0;max-height:200px;overflow-y:auto;">${escapeText(formatPrompt(attempt.prompt))}</pre>
            </div>
            ${attempt.output ? `
            <div>
              <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">AI Output</div>
              <pre style="background:#f8fafc;color:#374151;padding:10px;border-radius:5px;font-size:11px;white-space:pre-wrap;word-wrap:break-word;margin:0;max-height:200px;overflow-y:auto;border:1px solid #e2e8f0;">${escapeText(attempt.output)}</pre>
            </div>` : ""}
          </div>`;
      })
      .join("");

    roundsHtml += `
      <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px;background:#f8fafc;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">
          <h3 style="margin:0;color:#0891b2;font-size:14px;">Round ${roundNum}: ${label}</h3>
          <div style="display:flex;gap:16px;font-size:12px;color:#64748b;align-items:center;">
            <span>Final Score: <strong style="color:${finalScoreColor}">${finalPct}%</strong></span>
            <span>Attempts: <strong>${totalAttempts}</strong></span>
          </div>
        </div>
        ${attemptsCardsHtml}
        <div style="margin-top:8px;">
          <div style="font-size:11px;color:#b45309;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Why It Fell Short</div>
          <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:12px;font-size:12px;color:#78350f;line-height:1.6;white-space:pre-wrap;">${tip}</div>
        </div>
        ${idealPrompts[roundNum] ? `
        <div style="margin-top:8px;">
          <div style="font-size:11px;color:#0e7490;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Ideal Prompt (reference)</div>
          <pre style="background:#ecfeff;border:1px solid #67e8f9;border-radius:6px;padding:12px;font-size:12px;color:#155e75;line-height:1.6;white-space:pre-wrap;word-wrap:break-word;margin:0;max-height:360px;overflow-y:auto;">${escapeHtml(idealPrompts[roundNum])}</pre>
        </div>` : ""}
      </div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(player.name)} - Prompt Wars Response Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 32px; color: #1e293b; background: #fff; }
    @media print { body { padding: 16px; } }
  </style></head><body>
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#0891b2;margin:0 0 4px;font-size:24px;">Prompt Wars - Response Report</h1>
      <p style="color:#64748b;margin:0;font-size:13px;">Player Submission Details</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;padding:20px;background:#f1f5f9;border-radius:8px;border:1px solid #e2e8f0;">
      <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;">Name</span><br/><strong>${escapeHtml(player.name)}</strong></div>
      <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;">Email</span><br/><strong>${escapeHtml(player.email ?? "")}</strong></div>
      <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;">Rounds Played</span><br/><strong>${player.roundsPlayed}</strong></div>
      <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;">Time Taken</span><br/><strong>${Math.floor(timeTakenSec / 60)}m ${timeTakenSec % 60}s</strong></div>
      <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;">Avg Accuracy</span><br/><strong>${(player.avgAccuracy * 100).toFixed(1)}%</strong></div>
      <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;">Total Attempts</span><br/><strong>${player.attemptsTaken}</strong></div>
      <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;">Status</span><br/><strong>${escapeHtml(statusLabel)}</strong></div>
      <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;">Completed At</span><br/><strong>${player.completedAt ? new Date(player.completedAt).toLocaleString() : "N/A"}</strong></div>
    </div>
    <div style="margin-bottom:24px;padding:16px;background:#ecfeff;border:1px solid #67e8f9;border-radius:8px;">
      <div style="font-size:11px;color:#0e7490;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">${escapeHtml(coachingSummary.headline)}</div>
      <div style="font-size:13px;line-height:1.7;color:#155e75;white-space:pre-wrap;">${escapeHtml(coachingSummary.overview)}</div>
      <div style="display:grid;gap:8px;margin-top:12px;">
        ${coachingSummary.bullets.map((bullet) => `
          <div style="font-size:12px;color:#164e63;background:#f0fdff;border:1px solid #a5f3fc;border-radius:6px;padding:10px 12px;line-height:1.6;">${escapeHtml(bullet)}</div>
        `).join("")}
      </div>
    </div>
    <h2 style="color:#0891b2;font-size:16px;margin-bottom:16px;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Round-by-Round Responses</h2>
    ${sortedRounds.length > 0 ? roundsHtml : '<p style="color:#94a3b8;text-align:center;padding:24px;">No round data recorded.</p>'}
    <p style="color:#94a3b8;text-align:center;font-size:11px;margin-top:32px;">Generated on ${new Date().toLocaleString()}</p>
  </body></html>`;
}
