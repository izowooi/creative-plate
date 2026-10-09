import test from "node:test";
import assert from "node:assert/strict";
import worker, {
  normalizeId,
  validateAnswers,
  validateResult,
} from "../worker/index.js";

const env = {
  SUPABASE_URL: "https://database.invalid",
  SUPABASE_ANON_KEY: "test-public-key",
};
const request = (path, input, method = "POST", headers = {}) =>
  new Request(`https://app.example${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });

async function mockRpc(result, action, status = 200) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options, data: JSON.parse(options.body) });
    return new Response(JSON.stringify(result), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await action(calls);
  } finally {
    globalThis.fetch = original;
  }
}

test("ID canonicalization permits Korean but rejects short and ambiguous input", () => {
  assert.equal(normalizeId("  나의안전한보관아이디  "), "나의안전한보관아이디");
  assert.equal(
    normalizeId("가나다라마바사아".normalize("NFD")),
    "가나다라마바사아",
  );
  for (const id of [
    "short",
    "contains space",
    "id/../secret",
    "x".repeat(65),
    null,
  ])
    assert.throws(() => normalizeId(id));
});

test("partial answers require only q1 through q54 integer values", () => {
  assert.deepEqual(validateAnswers({}), {});
  assert.deepEqual(validateAnswers({ q1: 1, q54: 5 }), { q1: 1, q54: 5 });
  for (const answers of [
    [],
    { q0: 1 },
    { q55: 1 },
    { q1: "5" },
    { q1: 2.5 },
    { q1: 0 },
    { q1: 6 },
    { id: "personal" },
  ])
    assert.throws(() => validateAnswers(answers));
});

test("share validates scores, adjacent wing and profile identity including equal-score result", () => {
  const valid = {
    scores: [100, 80, 30, 20, 10, 20, 50, 60, 70],
    primary: 1,
    wing: 9,
    profileKey: "1w9",
  };
  assert.deepEqual(validateResult(valid), valid);
  assert.deepEqual(
    validateResult({
      scores: Array(9).fill(50),
      primary: null,
      wing: null,
      profileKey: null,
    }),
    { scores: Array(9).fill(50), primary: null, wing: null, profileKey: null },
  );
  assert.equal(
    validateResult({
      scores: [50, 45.8, 50, 50, 50, 50, 50, 50, 50],
      primary: null,
      wing: null,
      profileKey: null,
    }).primary,
    null,
  );
  for (const input of [
    { ...valid, wing: 8 },
    { ...valid, profileKey: "1w2" },
    { ...valid, primary: 2 },
    { ...valid, scores: Array(9).fill(Infinity) },
    { ...valid, scores: [100] },
    { ...valid, primary: null },
  ])
    assert.throws(() => validateResult(input));
});

test("session identity is hashed before RPC and no personal ID is returned", async () => {
  await mockRpc(
    { session: { answers: { q1: 4 }, revision: 2 } },
    async (calls) => {
      const response = await worker.fetch(
        request("/api/session/load", { id: "my-long-id" }),
        env,
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        session: { answers: { q1: 4 }, revision: 2 },
      });
      assert.match(calls[0].data.p_identity_hash, /^[a-f0-9]{64}$/);
      assert.equal(JSON.stringify(calls[0]).includes("my-long-id"), false);
      assert.equal(response.headers.get("cache-control"), "no-store");
    },
  );
});

test("modern Supabase publishable keys are never misused as Bearer JWTs", async () => {
  await mockRpc({ session: null }, async (calls) => {
    const modernEnv = { ...env, SUPABASE_ANON_KEY: "sb_publishable_test" };
    assert.equal(
      (
        await worker.fetch(
          request("/api/session/load", { id: "my-long-id" }),
          modernEnv,
        )
      ).status,
      200,
    );
    assert.equal(calls[0].options.headers.apikey, "sb_publishable_test");
    assert.equal(
      Object.hasOwn(calls[0].options.headers, "Authorization"),
      false,
    );
  });
});

test("optimistic save conflicts preserve remote answers and use 409", async () => {
  const conflict = {
    error: "conflict",
    session: { answers: { q1: 3 }, revision: 7 },
  };
  await mockRpc(conflict, async (calls) => {
    const response = await worker.fetch(
      request("/api/session/save", {
        id: "my-long-id",
        answers: { q1: 5 },
        revision: 6,
      }),
      env,
    );
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), conflict);
    assert.equal(calls[0].data.p_revision, 6);
    assert.deepEqual(calls[0].data.p_answers, { q1: 5 });
  });
});

test("invalid saves are rejected before DB access", async () => {
  await mockRpc({}, async (calls) => {
    for (const input of [
      { id: "my-long-id", answers: { q55: 2 }, revision: 0 },
      { id: "my-long-id", answers: {}, revision: -1 },
      { id: "my-long-id", answers: {}, revision: 0.5 },
    ])
      assert.equal(
        (await worker.fetch(request("/api/session/save", input), env)).status,
        400,
      );
    assert.equal(calls.length, 0);
  });
});

test("share stores public result fields only and anonymizes network rate key", async () => {
  await mockRpc(
    { id: "bf424438-dd0f-4c36-a01f-b1bdbd847e63" },
    async (calls) => {
      const response = await worker.fetch(
        request(
          "/api/share",
          {
            scores: [90, 80, 50, 60, 50, 50, 60, 70, 85],
            primary: 1,
            wing: 9,
            profileKey: "1w9",
            id: "should-not-leak",
            answers: { q1: 5 },
          },
          "POST",
          { "CF-Connecting-IP": "203.0.113.5" },
        ),
        env,
      );
      assert.equal(response.status, 201);
      assert.match(calls[0].data.p_client_hash, /^[a-f0-9]{64}$/);
      assert.equal(
        JSON.stringify(calls[0].data).includes("should-not-leak"),
        false,
      );
      assert.equal(
        JSON.stringify(calls[0].data).includes("203.0.113.5"),
        false,
      );
      assert.equal(Object.hasOwn(calls[0].data, "answers"), false);
    },
  );
});

test("share lookup rejects malformed IDs and absent result", async () => {
  assert.equal(
    (await worker.fetch(request("/api/share/invalid", undefined, "GET"), env))
      .status,
    404,
  );
  await mockRpc(null, async () =>
    assert.equal(
      (
        await worker.fetch(
          request(
            "/api/share/bf424438-dd0f-4c36-a01f-b1bdbd847e63",
            undefined,
            "GET",
          ),
          env,
        )
      ).status,
      404,
    ),
  );
});

test("database and edge limits produce 429 with retry hint", async () => {
  await mockRpc({ error: "rate_limit" }, async () => {
    const response = await worker.fetch(
      request("/api/session/load", { id: "my-long-id" }),
      env,
    );
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "60");
  });
  const limited = {
    ...env,
    API_LIMITER: { limit: async () => ({ success: false }) },
  };
  assert.equal(
    (await worker.fetch(request("/api/health", undefined, "GET"), limited))
      .status,
    429,
  );
});

test("failed RPC hides database details and credentials", async () => {
  await mockRpc(
    { message: "sensitive database diagnostic" },
    async () => {
      const response = await worker.fetch(
        request("/api/session/load", { id: "my-long-id" }),
        env,
      );
      assert.equal(response.status, 503);
      assert.equal((await response.text()).includes("sensitive"), false);
    },
    500,
  );
  assert.equal(
    (await worker.fetch(request("/api/session/load", { id: "my-long-id" }), {}))
      .status,
    503,
  );
});

test("cross-origin mutation, wrong method and oversize streaming body are rejected", async () => {
  assert.equal(
    (
      await worker.fetch(
        request("/api/session/load", { id: "my-long-id" }, "POST", {
          origin: "https://other.example",
        }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (await worker.fetch(request("/api/session/load", undefined, "GET"), env))
      .status,
    405,
  );
  assert.equal(
    (
      await worker.fetch(
        request("/api/session/load", {
          id: "my-long-id",
          extra: "x".repeat(17000),
        }),
        env,
      )
    ).status,
    413,
  );
  const malformed = new Request("https://app.example/api/session/load", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{broken",
  });
  assert.equal((await worker.fetch(malformed, env)).status, 400);
});

test("unmatched site routes use ASSETS and session deletion uses hash RPC", async () => {
  const response = await worker.fetch(
    new Request("https://app.example/results"),
    { ASSETS: { fetch: async () => new Response("app shell") } },
  );
  assert.equal(await response.text(), "app shell");
  await mockRpc({ deleted: true }, async (calls) => {
    assert.deepEqual(
      await (
        await worker.fetch(
          request("/api/session", { id: "my-long-id" }, "DELETE"),
          env,
        )
      ).json(),
      { deleted: true },
    );
    assert.match(calls[0].url, /enneagram_session_delete$/);
  });
});
