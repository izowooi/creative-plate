import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { assertMediaTools, concatMp4, extractExtensionTail, extractSeedWindow, makeSyntheticMp4, probeDuration } from "../src/lib/media.js";
import { removeDir, tempDir } from "./helpers.js";

test("media chain extracts seed, tail, and concatenates mp4 clips", async (t) => {
  try {
    await assertMediaTools();
  } catch {
    t.skip("ffmpeg/ffprobe not available");
    return;
  }
  const dir = await tempDir("grok-chain-media-");
  try {
    const first = join(dir, "first.mp4");
    const extended = join(dir, "extended.mp4");
    const seed = join(dir, "seed.mp4");
    const tail = join(dir, "tail.mp4");
    const final = join(dir, "final.mp4");
    await makeSyntheticMp4(first, 12, "red");
    await makeSyntheticMp4(extended, 20, "green");
    const seedDuration = await extractSeedWindow(first, seed, 10);
    assert.ok(seedDuration > 9 && seedDuration <= 10.2);
    const tailDuration = await extractExtensionTail(extended, tail, 10, 10);
    assert.ok(tailDuration > 9 && tailDuration <= 10.2);
    await concatMp4([first, tail], final);
    const finalDuration = await probeDuration(final);
    assert.ok(finalDuration > 20 && finalDuration < 24);
  } finally {
    await removeDir(dir);
  }
});
