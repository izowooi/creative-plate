import { describe, expect, it } from "vitest";
import { moderationResultSchema, safePrompt } from "./safety";

describe("safety gate", () => {
  it("rejects violence, sexual content, unrelated images and missing subjects", () => {
    for (const reason of ["graphic_violence", "sexual", "unrelated", "no_subject"] as const) {
      expect(moderationResultSchema.parse({ allowed: false, reason, summary: "blocked" }).allowed).toBe(false);
    }
  });

  it("adds strict preservation and safety instructions to the edit prompt", () => {
    const prompt = safePrompt("");
    expect(prompt).toContain("<IMAGE_REF_0>");
    expect(prompt).toContain("Keep everything else the same");
    expect(prompt).toContain("no graphic violence");
  });
});
