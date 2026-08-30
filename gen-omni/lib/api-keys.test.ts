import { describe, expect, it, vi } from "vitest";
import { configuredApiKeys, runWithApiKeyFallback } from "./api-keys";

describe("API key fallback", () => {
  it("supports the existing KEY2 naming convention", () => {
    expect(configuredApiKeys({ GEMINI_API_KEY: "first", GEMINI_API_KEY2: "second" }))
      .toEqual(["first", "second"]);
  });

  it("uses the first configured key first", async () => {
    const task = vi.fn().mockResolvedValue("ok");
    await expect(runWithApiKeyFallback(["first", "second"], task)).resolves.toBe("ok");
    expect(task).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledWith("first", 0);
  });

  it("uses the second key only for retryable authentication or quota failures", async () => {
    const task = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("quota"), { status: 429 }))
      .mockResolvedValueOnce("ok");
    await expect(runWithApiKeyFallback(["first", "second"], task)).resolves.toBe("ok");
    expect(task).toHaveBeenNthCalledWith(2, "second", 1);
  });

  it("does not leak keys in its final error", async () => {
    const task = vi.fn().mockRejectedValue(Object.assign(new Error("bad first-secret"), { status: 401 }));
    await expect(runWithApiKeyFallback(["first-secret", "second-secret"], task))
      .rejects.toThrow("모든 API 키로 요청하지 못했습니다");
  });
});
