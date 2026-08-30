// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fileNameFromGoogleUri } from "./omni";

describe("Omni URI delivery", () => {
  it("extracts the File API resource name from a download URI", () => {
    expect(fileNameFromGoogleUri("https://generativelanguage.googleapis.com/v1beta/files/abc-123:download?alt=media"))
      .toBe("files/abc-123");
  });

  it("rejects non-Google or malformed URIs", () => {
    expect(fileNameFromGoogleUri("https://example.com/files/abc")).toBeNull();
    expect(fileNameFromGoogleUri("not-a-uri")).toBeNull();
  });
});
