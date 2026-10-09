import assert from "node:assert/strict";
import { test } from "node:test";

import { AgentUnavailable, detectAgent, fetchPage, makeFetchImpl, send, EXTENSION_ID } from "../src/agent.js";
import { DbError, SupabaseStore } from "../src/store.js";

const jsonResponse = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function recorder(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    return handler(url, init, calls.length);
  };
  return { calls, fetchImpl };
}

// ---------- SupabaseStore ----------

test("page 조회: nw_pages 행을 Crawler 가 쓰는 페이지 객체로 바꾼다", async () => {
  const { calls, fetchImpl } = recorder(() => jsonResponse([{ key: "k1", title: "전생검신", final_url: "https://namu.wiki/w/x", status: 200, html: "<h1>", via: "브라우저 fetch", note: "", fetched_at: "2026-10-09T12:01:05.837686+00:00" }]));
  const store = new SupabaseStore({ fetchImpl });
  const got = await store.get("page:k1");
  assert.equal(calls[0].url, "/api/db/nw_pages?key=eq.k1&select=*&limit=1");
  assert.deepEqual(got["page:k1"], { title: "전생검신", url: "https://namu.wiki/w/x", status: 200, html: "<h1>", via: "브라우저 fetch", note: "", fetched_at: Date.parse("2026-10-09T12:01:05.837686+00:00") / 1000 });
});

test("없는 키는 빈 객체를 돌려준다(Crawler 는 undefined 로 읽는다)", async () => {
  const { fetchImpl } = recorder(() => jsonResponse([]));
  const store = new SupabaseStore({ fetchImpl });
  assert.deepEqual(await store.get("page:none"), {});
  assert.deepEqual(await store.get("css:none"), {});
  assert.deepEqual(await store.get("unknown:key"), {});
});

test("page 저장: 초 단위 시각을 ISO 로, url 은 final_url 로 upsert 한다", async () => {
  const { calls, fetchImpl } = recorder(() => jsonResponse(null, 204));
  const store = new SupabaseStore({ fetchImpl });
  await store.set({ "page:k1": { title: "가", url: "https://namu.wiki/w/%EA%B0%80", status: 404, html: "", via: "브라우저 fetch", fetched_at: 1790000000 } });
  assert.equal(calls[0].url, "/api/db/nw_pages?on_conflict=key");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Prefer, "resolution=merge-duplicates,return=minimal");
  assert.deepEqual(calls[0].body, { key: "k1", title: "가", status: 404, final_url: "https://namu.wiki/w/%EA%B0%80", via: "브라우저 fetch", note: "", html: "", fetched_at: "2026-09-21T14:13:20.000Z" });
});

test("index 는 최근 문서 목록으로 만들고, index 저장은 무시한다", async () => {
  const { calls, fetchImpl } = recorder(() => jsonResponse([{ key: "a", title: "A", status: 200, via: "v", fetched_at: "2026-10-09T00:00:00+00:00" }]));
  const store = new SupabaseStore({ fetchImpl });
  const { index } = await store.get("index");
  assert.equal(calls[0].url, "/api/db/nw_pages?select=key,title,status,via,fetched_at&order=fetched_at.desc&limit=100");
  assert.deepEqual(index.a, { title: "A", status: 200, via: "v", fetched_at: Date.parse("2026-10-09T00:00:00+00:00") / 1000 });
  await store.set({ index: { a: {} } });
  assert.equal(calls.length, 1);
});

test("CSS·폰트는 한 번만 받아 메모리에 두고, 저장하면 upsert 한다", async () => {
  const { calls, fetchImpl } = recorder(() => jsonResponse([{ body: "body{}" }]));
  const store = new SupabaseStore({ fetchImpl });
  assert.equal((await store.get("css:abc"))["css:abc"], "body{}");
  assert.equal((await store.get("css:abc"))["css:abc"], "body{}");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/db/nw_assets?key=eq.css%3Aabc&select=body&limit=1");

  const second = recorder(() => jsonResponse(null, 204));
  const writer = new SupabaseStore({ fetchImpl: second.fetchImpl, now: () => 0 });
  await writer.set({ "font:espejo/i.woff2": "QUJD" });
  assert.deepEqual(second.calls[0].body, { key: "font:espejo/i.woff2", kind: "font", body: "QUJD", fetched_at: "1970-01-01T00:00:00.000Z" });
  assert.equal((await writer.get("font:espejo/i.woff2"))["font:espejo/i.woff2"], "QUJD");
  assert.equal(second.calls.length, 1);
});

test("DB 오류는 상태 코드를 담은 DbError 로 던진다", async () => {
  const { fetchImpl } = recorder(() => new Response("로그인이 필요합니다", { status: 401 }));
  const store = new SupabaseStore({ fetchImpl });
  await assert.rejects(store.get("page:x"), (e) => e instanceof DbError && e.status === 401);
});

test("대기열: 등록, 중복(409)은 오류가 아니라 duplicate, 목록·정리", async () => {
  let n = 0;
  const { calls, fetchImpl } = recorder(() => (++n === 2 ? new Response("dup", { status: 409 }) : jsonResponse(null, 204)));
  const store = new SupabaseStore({ fetchImpl });
  assert.deepEqual(await store.enqueue("가"), { queued: true });
  assert.deepEqual(await store.enqueue("가"), { queued: false, duplicate: true });
  assert.deepEqual(calls[0].body, { title: "가" });
  await store.clearFinishedJobs();
  assert.equal(calls[2].url, "/api/db/nw_jobs?status=in.(done,not_found,error)");
  assert.equal(calls[2].init.method, "DELETE");
  const failing = new SupabaseStore({ fetchImpl: async () => new Response("boom", { status: 500 }) });
  await assert.rejects(failing.enqueue("가"), DbError);
});

// ---------- 에이전트 브리지 ----------

const fakeChrome = (reply, lastError) => ({
  runtime: {
    get lastError() { return lastError; },
    sendMessage: (id, message, callback) => setTimeout(() => callback(typeof reply === "function" ? reply(id, message) : reply), 0),
  },
});

test("detectAgent: ping 에 ok 로 답하면 사용 가능, 아니면 불가", async () => {
  assert.deepEqual(await detectAgent({ chromeApi: fakeChrome({ ok: true, version: "0.2.0" }) }), { available: true, version: "0.2.0" });
  assert.deepEqual(await detectAgent({ chromeApi: fakeChrome(undefined, { message: "Could not establish connection" }) }), { available: false });
  assert.deepEqual(await detectAgent({ chromeApi: undefined }), { available: false });
  assert.deepEqual(await detectAgent({ chromeApi: {} }), { available: false });
});

test("send: 고정된 확장 ID 로 보내고, 응답 없이 오래 걸리면 실패한다", async () => {
  let seen;
  await send({ type: "ping" }, { chromeApi: fakeChrome((id, m) => { seen = { id, m }; return { ok: true }; }) });
  assert.deepEqual(seen, { id: EXTENSION_ID, m: { type: "ping" } });
  const silent = { runtime: { lastError: undefined, sendMessage: () => {} } };
  await assert.rejects(send({ type: "x" }, { chromeApi: silent, timeoutMs: 20 }), AgentUnavailable);
});

test("fetchPage: 에이전트 오류 응답은 예외가 된다", async () => {
  const ok = await fetchPage("https://namu.wiki/w/x", { chromeApi: fakeChrome({ status: 200, html: "<h1>", url: "https://namu.wiki/w/x" }) });
  assert.equal(ok.status, 200);
  await assert.rejects(fetchPage("https://namu.wiki/w/x", { chromeApi: fakeChrome({ error: "차단됨" }) }), /차단됨/);
});

test("makeFetchImpl: 스킨은 /api/skin 으로, 문서는 에이전트로 보낸다", async () => {
  const calls = [];
  const impl = makeFetchImpl({
    pageFetcher: async (url) => { calls.push(["page", url]); return { status: 404, html: "없음", url: "https://namu.wiki/w/y" }; },
    fetchImpl: async (url) => { calls.push(["skin", url]); return new Response("css"); },
  });
  await impl("https://namu.wiki/skins/espejo/a.css");
  assert.deepEqual(calls[0], ["skin", "/api/skin?path=espejo%2Fa.css"]);
  const doc = await impl("https://namu.wiki/w/y");
  assert.equal(doc.status, 404);
  assert.equal(doc.ok, false);
  assert.equal(await doc.text(), "없음");
  assert.equal(doc.url, "https://namu.wiki/w/y");
  assert.equal(doc.headers.get("Retry-After"), null);
  const limited = makeFetchImpl({ pageFetcher: async () => ({ status: 429, html: "", retryAfter: 30 }) });
  assert.equal((await limited("https://namu.wiki/w/z")).headers.get("Retry-After"), "30");
  await assert.rejects(impl("https://example.com/x"), /지원하지 않는 주소/);
});
