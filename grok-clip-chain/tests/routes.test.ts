import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildApp } from "../src/server.js";
import { assertMediaTools, makeSyntheticMp4 } from "../src/lib/media.js";
import { close, jsonServer, listen, parseSse, removeDir, tempDir, testConfig } from "./helpers.js";

async function makeVideoFixtures(dir: string) {
  const first = join(dir, "first.mp4");
  const extended = join(dir, "extended.mp4");
  await makeSyntheticMp4(first, 10, "red");
  await makeSyntheticMp4(extended, 20, "green");
  return { first: await readFile(first), extended: await readFile(extended) };
}

test("plan and run routes stream a successful 20-second chain", async (t) => {
  try {
    await assertMediaTools();
  } catch {
    t.skip("ffmpeg/ffprobe not available");
    return;
  }
  const dir = await tempDir("grok-chain-routes-");
  const videos = await makeVideoFixtures(dir);
  let generationPolls = 0;
  let extensionPolls = 0;
  let proxyBase = "";
  const proxy = jsonServer((url, _body, res) => {
    if (url.includes("/v1/chat/completions")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        choices: [{
          message: {
            tool_calls: [{
              type: "function",
              function: {
                name: "create_video_plan",
                arguments: JSON.stringify({
                  title: "Rainy alley",
                  segments: [
                    { index: 1, prompt: "A rainy alley opening shot, no music, footsteps, stable ending frame." },
                    { index: 2, prompt: "Continue through the alley, camera follows forward, rain fades, stable door close-up ending." },
                  ],
                }),
              },
            }],
          },
        }],
      }));
      return;
    }
    if (url.includes("/v1/videos/generations")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ request_id: "gen-1" }));
      return;
    }
    if (url.includes("/v1/videos/extensions")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ request_id: "ext-1" }));
      return;
    }
    if (url.includes("/v1/videos/gen-1")) {
      generationPolls += 1;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: generationPolls < 2 ? "pending" : "done", progress: 100, video: { url: `${proxyBase}/dl/first.mp4`, duration: 10, respect_moderation: true } }));
      return;
    }
    if (url.includes("/v1/videos/ext-1")) {
      extensionPolls += 1;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: extensionPolls < 2 ? "pending" : "done", progress: 100, video: { url: `${proxyBase}/dl/extended.mp4`, duration: 20, respect_moderation: true } }));
      return;
    }
    if (url.includes("/dl/first.mp4")) {
      res.writeHead(200, { "Content-Type": "video/mp4" });
      res.end(videos.first);
      return;
    }
    if (url.includes("/dl/extended.mp4")) {
      res.writeHead(200, { "Content-Type": "video/mp4" });
      res.end(videos.extended);
      return;
    }
    res.writeHead(404);
    res.end("nope");
  });
  const proxyUrl = await listen(proxy);
  proxyBase = proxyUrl;
  const cfg = testConfig(dir, Number(new URL(proxyUrl).port));
  const appServer = createServer(buildApp({ config: cfg }));
  const appUrl = await listen(appServer);
  try {
    const planRes = await fetch(`${appUrl}/api/plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "비 오는 골목을 20초로 만들어줘", targetLength: 20 }),
    });
    assert.equal(planRes.status, 200);
    const { plan } = (await planRes.json()) as any;
    assert.equal(plan.segments.length, 2);
    assert.equal(plan.resolution, "720p");

    const runRes = await fetch(`${appUrl}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const events = parseSse(await runRes.text());
    assert.ok(events.some((event) => event.event === "planning"));
    assert.equal(events.filter((event) => event.event === "segment-done").length, 2);
    const done = events.find((event) => event.event === "merge-done");
    assert.ok(done);
    const runId = done!.data.runId;
    const download = await fetch(`${appUrl}/api/runs/${runId}/download`);
    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-type") || "", /video\/mp4/);
    assert.ok((await download.arrayBuffer()).byteLength > 1000);
  } finally {
    await close(appServer);
    await close(proxy);
    await removeDir(dir);
  }
});

test("run route retries failed segment twice then pauses on the third failure", async (t) => {
  try {
    await assertMediaTools();
  } catch {
    t.skip("ffmpeg/ffprobe not available");
    return;
  }
  const dir = await tempDir("grok-chain-pause-");
  const videos = await makeVideoFixtures(dir);
  let extensionStarts = 0;
  let proxyBase = "";
  const proxy = jsonServer((url, _body, res) => {
    if (url.includes("/v1/videos/generations")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ request_id: "gen-1" }));
      return;
    }
    if (url.includes("/v1/videos/gen-1")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "done", progress: 100, video: { url: `${proxyBase}/dl/first.mp4`, duration: 10, respect_moderation: true } }));
      return;
    }
    if (url.includes("/dl/first.mp4")) {
      res.writeHead(200, { "Content-Type": "video/mp4" });
      res.end(videos.first);
      return;
    }
    if (url.includes("/v1/videos/extensions")) {
      extensionStarts += 1;
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "temporary upstream failure" }));
      return;
    }
    res.writeHead(404);
    res.end("nope");
  });
  const proxyUrl = await listen(proxy);
  proxyBase = proxyUrl;
  const cfg = testConfig(dir, Number(new URL(proxyUrl).port));
  const appServer = createServer(buildApp({ config: cfg }));
  const appUrl = await listen(appServer);
  try {
    const plan = {
      id: "plan-test",
      title: "Pause test",
      originalPrompt: "test",
      startMode: "text",
      targetLength: 20,
      segmentDuration: 10,
      resolution: "720p",
      aspectRatio: "16:9",
      createdAt: Date.now(),
      estimatedOutputSeconds: 20,
      estimatedSeedInputSeconds: 10,
      segments: [
        { index: 1, duration: 10, prompt: "Opening clip." },
        { index: 2, duration: 10, prompt: "Continue clip." },
      ],
    };
    const runRes = await fetch(`${appUrl}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const events = parseSse(await runRes.text());
    assert.equal(events.filter((event) => event.event === "retry").length, 2);
    const paused = events.find((event) => event.event === "paused");
    assert.ok(paused);
    assert.equal(paused!.data.segment, 2);
    assert.equal(extensionStarts, 3);
    const runState = await fetch(`${appUrl}/api/runs/${paused!.data.runId}`);
    const { run } = (await runState.json()) as any;
    assert.equal(run.status, "paused");
    assert.equal(run.currentSegment, 2);
  } finally {
    await close(appServer);
    await close(proxy);
    await removeDir(dir);
  }
});
