import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const origin = process.argv[2] || "https://eg.zowoo.uk";
const id = `qa-${randomUUID()}`;
async function request(path, body, method = "POST") {
  const response = await fetch(`${origin}/api/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, data: await response.json() };
}
let balancedShare;
try {
  const health = await request("health", undefined, "GET");
  assert.equal(health.status, 200);
  assert.equal(health.data.storage, true);
  const profiles = await request("profiles", undefined, "GET");
  assert.equal(profiles.status, 200);
  assert.equal(profiles.data.length, 27);
  assert.equal(new Set(profiles.data.map((p) => p.key)).size, 27);
  const save = await request("session/save", {
    id,
    answers: { q1: 4, q5: 5 },
    revision: 0,
  });
  assert.equal(save.status, 200);
  assert.equal(save.data.revision, 1);
  const load = await request("session/load", { id });
  assert.deepEqual(load.data.session.answers, { q1: 4, q5: 5 });
  const conflict = await request("session/save", {
    id,
    answers: { q1: 1 },
    revision: 0,
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.data.session.revision, 1);
  const invalid = await request("session/save", {
    id,
    answers: { q99: 4 },
    revision: 1,
  });
  assert.equal(invalid.status, 400);
  const update = await request("session/save", {
    id,
    answers: { q1: 4, q5: 5, q9: 3 },
    revision: 1,
  });
  assert.equal(update.status, 200);
  assert.equal(update.data.revision, 2);
  const share = await request("share", {
    scores: Array(9).fill(50),
    primary: null,
    wing: null,
    profileKey: null,
  });
  assert.equal(share.status, 201);
  balancedShare = share.data.id;
  const shared = await request(`share/${balancedShare}`, undefined, "GET");
  assert.equal(shared.status, 200);
  assert.equal(shared.data.primary, null);
  assert.deepEqual(shared.data.scores, Array(9).fill(50));
  assert.deepEqual(Object.keys(shared.data).sort(), [
    "createdAt",
    "primary",
    "profileKey",
    "scores",
    "wing",
  ]);
  const deleted = await request("session", { id }, "DELETE");
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.deleted, true);
  const missing = await request("session/load", { id });
  assert.equal(missing.data.session, null);
  const absentShare = await request(`share/${randomUUID()}`, undefined, "GET");
  assert.equal(absentShare.status, 404);
  console.log(
    JSON.stringify(
      {
        ok: true,
        origin,
        profiles: 27,
        sessionRoundTrip: true,
        optimisticConflict: true,
        validation: true,
        deleted: true,
        balancedShare,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await request("session", { id }, "DELETE").catch(() => {});
  throw error;
}
