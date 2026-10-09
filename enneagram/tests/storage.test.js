import test from "node:test";
import assert from "node:assert/strict";
import { STORAGE_KEY, readLocal, writeLocal, api } from "../src/storage.js";

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem: (key) => (key === STORAGE_KEY ? value : null),
    setItem: (key, input) => {
      assert.equal(key, STORAGE_KEY);
      value = input;
    },
    value: () => value,
  };
}

test("local progress round trips answers, storage ID and revision independently of results", () => {
  const storage = memoryStorage();
  const progress = {
    answers: { q1: 4, q54: 5 },
    id: "map-long-id",
    revision: 3,
    result: { primary: 1 },
    shared: true,
  };
  assert.equal(writeLocal(progress, storage), true);
  assert.deepEqual(readLocal(storage), {
    answers: progress.answers,
    id: progress.id,
    revision: 3,
  });
  assert.equal(Object.hasOwn(JSON.parse(storage.value()), "result"), false);
});

test("corrupted or unknown-version local records recover to empty progress", () => {
  for (const value of [
    null,
    "{broken",
    "null",
    "{}",
    JSON.stringify({ version: 2, answers: { q1: 5 } }),
    JSON.stringify({ version: 1, answers: null }),
  ]) {
    assert.deepEqual(readLocal(memoryStorage(value)), {
      answers: {},
      id: "",
      revision: 0,
    });
  }
});

test("restored answers exclude unknown IDs, strings and out-of-range values", () => {
  const input = {
    version: 1,
    answers: {
      q1: 1,
      q54: 5,
      q0: 3,
      q55: 3,
      q01: 3,
      q9: "3",
      q10: 0,
      q11: 6,
      q12: 2.5,
    },
    id: 12,
    revision: "2",
  };
  assert.deepEqual(readLocal(memoryStorage(JSON.stringify(input))), {
    answers: { q1: 1, q54: 5 },
    id: "",
    revision: 0,
  });
});

test("invalid local revision cannot permanently poison optimistic server saves", () => {
  for (const revision of [-1, Number.MAX_SAFE_INTEGER + 1, 0.5, null]) {
    const input = {
      version: 1,
      answers: { q1: 5 },
      id: "map-long-id",
      revision,
    };
    assert.equal(readLocal(memoryStorage(JSON.stringify(input))).revision, 0);
  }
});

test("storage quota and inaccessible storage preserve graceful local fallback", () => {
  const denied = {
    getItem() {
      throw new Error("disabled");
    },
    setItem() {
      throw new Error("quota");
    },
  };
  assert.deepEqual(readLocal(denied), { answers: {}, id: "", revision: 0 });
  assert.equal(writeLocal({ answers: {}, id: "", revision: 0 }, denied), false);
});

test("privacy-mode localStorage getter failure does not prevent app startup", () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("SecurityError: storage blocked");
    },
  });
  try {
    assert.deepEqual(readLocal(), { answers: {}, id: "", revision: 0 });
    assert.equal(writeLocal({ answers: {}, id: "", revision: 0 }), false);
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  }
});

test("API carries revision conflict snapshots without swallowing status", async () => {
  const previous = globalThis.fetch;
  const conflict = {
    error: "conflict",
    session: { answers: { q1: 4 }, revision: 5 },
  };
  let sent;
  globalThis.fetch = async (url, options) => {
    sent = { url, options };
    return new Response(JSON.stringify(conflict), { status: 409 });
  };
  try {
    await assert.rejects(
      api("session/save", {
        id: "map-long-id",
        answers: { q1: 3 },
        revision: 4,
      }),
      (error) => error.status === 409 && error.data.session.revision === 5,
    );
    assert.equal(sent.url, "/api/session/save");
    assert.equal(JSON.parse(sent.options.body).revision, 4);
  } finally {
    globalThis.fetch = previous;
  }
});

test("successful HTTP response with broken JSON cannot masquerade as a saved session", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("<html>fallback app</html>", { status: 200 });
  try {
    await assert.rejects(
      api("session/save", { id: "map-long-id", answers: {}, revision: 0 }),
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test("shared GET transport does not transmit local answers or identity", async () => {
  const previous = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, options) => {
    sent = { url, options };
    return new Response(
      JSON.stringify({
        scores: Array(9).fill(50),
        primary: null,
        wing: null,
        profileKey: null,
      }),
    );
  };
  try {
    await api("share/example", undefined, "GET");
    assert.equal(sent.options.method, "GET");
    assert.equal(sent.options.body, undefined);
  } finally {
    globalThis.fetch = previous;
  }
});
