import { describe, expect, it } from "vitest";
import { hasGroundingInstruction, hasNegativePrompting } from "./evaluator";

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
});
