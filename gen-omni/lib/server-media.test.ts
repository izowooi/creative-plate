// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readMp4Duration } from "./server-media";

describe("server media inspection", () => {
  it("reads duration from a version 0 mvhd box even when a video has no audio", () => {
    const box = Buffer.alloc(32);
    box.writeUInt32BE(32, 0);
    box.write("mvhd", 4, "ascii");
    box.writeUInt8(0, 8);
    box.writeUInt32BE(1_000, 20);
    box.writeUInt32BE(3_000, 24);
    expect(readMp4Duration(box)).toBe(3);
  });
});
