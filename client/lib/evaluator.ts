import { getOpenAI } from "./openai";
import { getSimilarity } from "./similarity";
import type { Round } from "./types";

type ObjectConstraints = {
  maxWords?: number;
  requiredSections?: string[];
  requireSteps?: boolean;
  mustInclude?: string[];
  mustExclude?: string[];
};

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
      ) {
        met++;
      }
    }
    return met / constraints.length;
  }

  if (!isPlainObject(constraints)) return 1;

  const c = constraints as ObjectConstraints;
  let score = 0;
  let total = 0;

  if (c.maxWords != null) {
    total++;
    const wordCount = output.split(/\s+/).filter(Boolean).length;
    if (wordCount <= c.maxWords) score++;
  }

  if (c.requiredSections?.length) {
    total++;
    const hasAll = c.requiredSections.every((section) =>
      output.includes(section)
    );
    if (hasAll) score++;
  }

  if (c.requireSteps) {
    total++;
    if (
      /step/i.test(output) ||
      /\b1\.|\b2\./.test(output) ||
      /first/i.test(output)
    ) {
      score++;
    }
  }

  if (c.mustInclude?.length) {
    total++;
    const has = c.mustInclude.every((word) =>
      output.toLowerCase().includes(word.toLowerCase())
    );
    if (has) score++;
  }

  if (c.mustExclude?.length) {
    total++;
    const hasForbidden = c.mustExclude.some((word) =>
      output.toLowerCase().includes(word.toLowerCase())
    );
    if (!hasForbidden) score++;
  }

  if (total === 0) return 1;

  return score / total;
}

async function judgePrompt(userPrompt: string): Promise<number> {
  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a strict prompt evaluator. Score from 0 to 1 based on clarity, specificity, and use of constraints. Reply with only a decimal number.",
      },
      {
        role: "user",
        content: `Score this prompt from 0 to 1. Only return a number.

Prompt:
${userPrompt}`,
      },
    ],
  });
  const text = completion.choices[0].message.content?.trim() ?? "0";
  const n = parseFloat(text);
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

function getBrevityScore(prompt: string): number {
  const words = prompt.trim().split(/\s+/).filter(Boolean).length;
  if (words > 15) return 0;
  return 1 - (words / 15) * 0.5;
}

async function judgeOutputQuality(output: string): Promise<number> {
  const res = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You evaluate explanations.",
      },
      {
        role: "user",
        content: `
Evaluate this explanation:

${output}

Score from 0 to 1 based on:
- simplicity
- clarity
- use of analogy

Only return a number.
        `,
      },
    ],
  });

  const text = res.choices[0].message.content?.trim() ?? "0";
  const n = parseFloat(text);
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

async function judgeAnalogyQuality(output: string): Promise<number> {
  const res = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You evaluate explanations.",
      },
      {
        role: "user",
        content: `
Evaluate this explanation:

${output}

Score from 0 to 1 based on:
- clarity and simplicity
- whether it uses a real-world analogy
- how easy it is to understand

Do NOT penalize topic differences.
Only return a number.
        `,
      },
    ],
  });

  const text = res.choices[0].message.content?.trim() ?? "0";
  const n = parseFloat(text);
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

async function judgeReasoning(output: string): Promise<number> {
  const res = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You evaluate reasoning quality." },
      {
        role: "user",
        content: `Evaluate the reasoning in this response and return a number from 0 to 1.

${output}

Consider logical coherence, step-by-step clarity, and correctness. Only return a number.`,
      },
    ],
  });

  const text = res.choices[0].message.content?.trim() ?? "0";
  const n = parseFloat(text);
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

function getStructureScore(output: string): number {
  // Simple heuristic: reward presence of bullets/numbered steps and headings
  const bullets = (output.match(/[-*]\s+/g) || []).length;
  const numbered = (output.match(/\b\d+\./g) || []).length;
  const sections = (output.match(/^#{1,6}\s+/m) || []).length;

  const score = Math.min(1, (bullets * 0.3 + numbered * 0.4 + sections * 0.3) / 3);
  return score;
}

async function evaluateOptimizeRound(userPrompt: string) {
  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: userPrompt }],
  });

  const output = completion.choices[0].message.content || "";

  const brevityScore = getBrevityScore(userPrompt);

  if (brevityScore === 0) {
    return {
      output,
      finalScore: 0,
      progress: 0,
      reason: "Prompt exceeds 15 words",
    };
  }

  const [analogyQualityScore, promptScore] = await Promise.all([
    judgeAnalogyQuality(output),
    judgePrompt(userPrompt),
  ]);

  const finalScore =
    0.4 * brevityScore +
    0.4 * analogyQualityScore +
    0.2 * promptScore;

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
  // Improve rounds provide an initial explanation and expect a better one.
  const initial = round.originalPrompt || round.input || "";

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "user", content: `${initial}\n\nImprove this explanation:\n${userPrompt}` },
    ],
  });

  const output = completion.choices[0].message.content || "";

  const [qualityScore, analogyScore, promptScore] = await Promise.all([
    judgeOutputQuality(output),
    judgeAnalogyQuality(output),
    judgePrompt(userPrompt),
  ]);

  const constraintScore = checkConstraints(round.constraints, userPrompt, output);

  // weight: quality 40%, analogy 20%, prompt 20%, constraints 20%
  const finalScore =
    0.4 * qualityScore + 0.2 * analogyScore + 0.2 * promptScore + 0.2 * constraintScore;

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
  // Reverse rounds give an output and expect the prompt that produced it.
  const target = round.expectedOutput || "";

  // measure similarity between the user's recovered prompt and the target using the similarity helper
  const sim = await getSimilarity(userPrompt, target);

  const qualityScore = await judgeOutputQuality(userPrompt);

  const constraintScore = checkConstraints(round.constraints, userPrompt, target);

  // weight: similarity 50%, quality 30%, constraints 20%
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
  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: userPrompt }],
  });

  const output = completion.choices[0].message.content || "";

  const reasoningScore = await judgeReasoning(output);
  const structureScore = getStructureScore(output);
  const promptScore = await judgePrompt(userPrompt);

  const finalScore =
    0.4 * reasoningScore +
    0.3 * structureScore +
    0.3 * promptScore;

  return {
    output,
    reasoningScore,
    structureScore,
    promptScore,
    finalScore,
    progress: Math.round(finalScore * 100),
  };
}

function evaluateConstraints(output: string): number {
  let score = 0;
  let total = 0;

  // Check word count is reasonable (under 500 words)
  total++;
  const wordCount = output.split(/\s+/).filter(Boolean).length;
  if (wordCount > 0 && wordCount <= 500) score++;

  // Check for structure markers
  total++;
  if (/[-*]\s+/.test(output) || /\b\d+\./.test(output) || /^#{1,6}\s+/m.test(output)) {
    score++;
  }

  // Check output is non-trivial
  total++;
  if (wordCount >= 20) score++;

  return total === 0 ? 1 : score / total;
}

function evaluateStructure(output: string): number {
  const bullets = (output.match(/[-*]\s+/g) || []).length;
  const numbered = (output.match(/\b\d+\./g) || []).length;
  const headings = (output.match(/^#{1,6}\s+/gm) || []).length;
  const paragraphs = output.split(/\n\n+/).filter((p) => p.trim().length > 0).length;

  const score = Math.min(
    1,
    (bullets * 0.2 + numbered * 0.3 + headings * 0.3 + paragraphs * 0.2) / 4
  );
  return score;
}

async function judgePersuasion(output: string): Promise<number> {
  const res = await getOpenAI().chat.completions.create({
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
  });

  const text = res.choices[0].message.content?.trim() ?? "0";
  const n = parseFloat(text);
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
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
        error: "Both metaPrompt and finalPrompt are required",
      };
    }

    const improvedPromptRes = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `${metaPrompt}\n\nBase Prompt:\n${basePrompt}`,
        },
      ],
    });

    const improvedPrompt =
      improvedPromptRes.choices[0].message.content || "";

    const finalOutputRes = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: finalPrompt,
        },
      ],
    });

    const finalOutput =
      finalOutputRes.choices[0].message.content || "";

    const constraintScore = evaluateConstraints(finalOutput);
    const structureScore = evaluateStructure(finalOutput);
    const persuasionScore = await judgePersuasion(finalOutput);
    const similarityScore = await getSimilarity(
      finalOutput,
      targetOutput
    );

    const [promptScore, metaPromptScore] = await Promise.all([
      judgePrompt(finalPrompt),
      judgePrompt(metaPrompt),
    ]);

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

    return {
      finalScore: 0,
      error: "Evaluation failed",
    };
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
