import { describe, expect, it } from "vitest";
import {
  MAX_EDIT_SECONDS,
  MAX_UPLOAD_SECONDS,
  apiResolutionFor,
  validateEditWindow,
  validateUploadDuration,
} from "./validation";

describe("video limits", () => {
  it("accepts uploads shorter than one minute", () => {
    expect(validateUploadDuration(59.99)).toEqual({ ok: true });
  });

  it("blocks videos at or over one minute", () => {
    expect(validateUploadDuration(60)).toMatchObject({ ok: false });
    expect(MAX_UPLOAD_SECONDS).toBe(60);
  });

  it("limits the Omni edit window to the documented ten seconds", () => {
    expect(validateEditWindow(0, 10, 59)).toEqual({ ok: true });
    expect(validateEditWindow(0, 10.01, 59)).toMatchObject({ ok: false });
    expect(MAX_EDIT_SECONDS).toBe(10);
  });
});

describe("cost guardrail", () => {
  it.each([
    ["360p", "360p"],
    ["480p", "720p"],
    ["720p", "720p"],
  ] as const)("maps %s to an Omni-supported resolution", (ui, api) => {
    expect(apiResolutionFor(ui)).toBe(api);
  });

  it("cannot request 1080p or 4K", () => {
    expect(() => apiResolutionFor("1080p" as never)).toThrow();
    expect(() => apiResolutionFor("4k" as never)).toThrow();
  });
});
