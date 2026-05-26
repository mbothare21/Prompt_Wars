import { describe, expect, it } from "vitest";
import {
  hasGroundingInstruction,
  hasNegativePrompting,
  scorePromptSpecificity,
} from "./evaluator";

describe("hasNegativePrompting", () => {
  it("detects grounded negative prompting language", () => {
    expect(
      hasNegativePrompting(
        "Summarize the meeting using only the provided input data. Do not add information of your own."
      )
    ).toBe(true);
  });

  it("rejects prompts that do not constrain hallucination", () => {
    expect(
      hasNegativePrompting(
        "Summarize the meeting in a concise way with clear sections."
      )
    ).toBe(false);
  });

  it("detects direct grounding instructions", () => {
    expect(
      hasGroundingInstruction(
        "Use only the input data. Do not hallucinate or add extra information."
      )
    ).toBe(true);
  });

  it("scores generic prompts as low specificity", () => {
    expect(scorePromptSpecificity("Summarize this")).toBeLessThan(0.3);
  });

  it("scores grounded prompts as more specific", () => {
    expect(
      scorePromptSpecificity(
        "Summarize the meeting into Conflicts, Decisions, Dependencies, Risks, and Next Steps. Use only the input data and do not hallucinate."
      )
    ).toBeGreaterThan(0.7);
  });
});
