import test from "node:test";
import assert from "node:assert/strict";
import { buildVideoExtensionPayload, buildVideoGenerationPayload, normalizeVideoPoll } from "../src/lib/videoAdapter.js";
import { testConfig } from "./helpers.js";

test("buildVideoGenerationPayload supports T2V and I2V", () => {
  const cfg = testConfig("/tmp/grok-chain-test");
  const t2v = buildVideoGenerationPayload(cfg, {
    prompt: "A clean cinematic opening shot.",
    duration: 10,
    resolution: "720p",
    aspectRatio: "16:9",
  });
  assert.equal(t2v.model, "grok-imagine-video");
  assert.equal(t2v.duration, 10);
  assert.equal(t2v.aspect_ratio, "16:9");
  assert.equal("image" in t2v, false);

  const i2v = buildVideoGenerationPayload(cfg, {
    prompt: "Animate the image with a slow push-in.",
    duration: 10,
    resolution: "720p",
    aspectRatio: "16:9",
    sourceImageB64: "AAAA",
    sourceImageMime: "image/png",
  });
  assert.deepEqual(i2v.image, { url: "data:image/png;base64,AAAA" });
});

test("buildVideoExtensionPayload embeds seed mp4 data url", () => {
  const cfg = testConfig("/tmp/grok-chain-test");
  const payload = buildVideoExtensionPayload(cfg, {
    prompt: "Continue the scene.",
    duration: 10,
    seedVideo: Buffer.from("video"),
  });
  assert.equal(payload.model, "grok-imagine-video");
  assert.equal(payload.duration, 10);
  assert.match((payload.video as any).url, /^data:video\/mp4;base64,/);
});

test("normalizeVideoPoll maps done, pending, and failed fields", () => {
  assert.deepEqual(normalizeVideoPoll({ status: "pending", progress: 42 }), { status: "pending", progress: 42, duration: null, usage: null });
  const done = normalizeVideoPoll({ status: "done", video: { url: "https://example.com/out.mp4", duration: 10, respect_moderation: true }, usage: { cost_in_usd_ticks: 1 } });
  assert.equal(done.videoUrl, "https://example.com/out.mp4");
  assert.equal(done.usage?.grok_cost_usd_ticks, 1);
  assert.equal(normalizeVideoPoll({ status: "failed", error: { code: "internal_error" } }).failedCode, "internal_error");
});
