import assert from "node:assert/strict";
import { test } from "node:test";

import { onRequest as middleware } from "../functions/api/_middleware.js";
import { onRequestPost as login } from "../functions/api/login.js";
import { onRequestPost as logout } from "../functions/api/logout.js";
import { onRequestGet as me } from "../functions/api/me.js";
import { COOKIE_NAME, readCookie, sha256Hex, timingSafeEqual, tokenValid } from "../server/auth.js";
import { proxyDb } from "../server/db.js";
import { fetchSkin, skinUrl } from "../server/skin.js";

const TOKEN = "t".repeat(43);
const ORIGIN = "https://namu.example";
const env = async (extra = {}) => ({ NW_TOKEN_SHA256: await sha256Hex(TOKEN), SUPABASE_URL: "https://db.example", SUPABASE_ANON_KEY: "sb_publishable_x", ...extra });
const req = (path, init = {}) => new Request(ORIGIN + path, init);
const cookie = (token = TOKEN) => ({ Cookie: `${COOKIE_NAME}=${token}` });

// ---------- auth 도우미 ----------

test("sha256Hex 는 알려진 값과 같다", async () => {
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("timingSafeEqual 은 길이가 달라도 거짓을 돌려준다", () => {
  assert.equal(timingSafeEqual("abc", "abc"), true);
  assert.equal(timingSafeEqual("abc", "abd"), false);
  assert.equal(timingSafeEqual("abc", "abcd"), false);
});

test("readCookie 는 여러 쿠키 중 이름으로 찾는다", () => {
  const r = req("/", { headers: { Cookie: `a=1; ${COOKIE_NAME}=xyz; b=2` } });
  assert.equal(readCookie(r, COOKIE_NAME), "xyz");
  assert.equal(readCookie(r, "none"), null);
});

test("tokenValid: 맞는 토큰만 통과하고 설정이 없으면 닫힌다", async () => {
  assert.equal((await tokenValid(TOKEN, await env())).ok, true);
  assert.equal((await tokenValid("wrong", await env())).ok, false);
  assert.equal((await tokenValid("", await env())).ok, false);
  assert.equal((await tokenValid(null, await env())).ok, false);
  const closed = await tokenValid(TOKEN, {});
  assert.deepEqual(closed, { ok: false, misconfigured: true });
  assert.equal((await tokenValid(TOKEN, { NW_TOKEN_SHA256: "zz" })).misconfigured, true);
});

// ---------- 미들웨어 ----------

const run = async (path, init, environment) => {
  const context = { request: req(path, init), env: environment ?? (await env()), data: {}, next: async () => new Response("next") };
  const response = await middleware(context);
  return { response, context };
};

test("미들웨어: 쿠키가 없거나 틀리면 401, 맞으면 다음으로 넘기고 토큰을 전달한다", async () => {
  assert.equal((await run("/api/me")).response.status, 401);
  assert.equal((await run("/api/me", { headers: cookie("wrong") })).response.status, 401);
  const ok = await run("/api/me", { headers: cookie() });
  assert.equal(await ok.response.text(), "next");
  assert.equal(ok.context.data.token, TOKEN);
});

test("미들웨어: 인증 설정이 없으면 503 으로 닫힌다", async () => {
  assert.equal((await run("/api/me", { headers: cookie() }, {})).response.status, 503);
});

test("미들웨어: 로그인·로그아웃 경로는 토큰 없이 통과한다", async () => {
  const origin = { Origin: ORIGIN };
  assert.equal(await (await run("/api/login", { method: "POST", headers: origin })).response.text(), "next");
  assert.equal(await (await run("/api/logout", { method: "POST", headers: origin })).response.text(), "next");
});

test("미들웨어: 다른 출처에서 온 상태 변경 요청은 403", async () => {
  const evil = { Origin: "https://evil.example", ...cookie() };
  assert.equal((await run("/api/db/nw_jobs", { method: "POST", headers: evil })).response.status, 403);
  assert.equal((await run("/api/db/nw_jobs", { method: "POST", headers: cookie() })).response.status, 403); // Origin 없음
  assert.equal((await run("/api/db/nw_jobs", { method: "POST", headers: { Origin: ORIGIN, ...cookie() } })).response.status, 200);
});

// ---------- 로그인 ----------

test("로그인: 맞는 토큰이면 HttpOnly·Secure·SameSite=Strict 쿠키를 심는다", async () => {
  const r = await login({ request: req("/api/login", { method: "POST", body: JSON.stringify({ token: ` ${TOKEN} ` }) }), env: await env() });
  assert.equal(r.status, 200);
  const set = r.headers.get("Set-Cookie");
  assert.ok(set.startsWith(`${COOKIE_NAME}=${TOKEN};`));
  for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/"]) assert.ok(set.includes(flag), flag);
  assert.equal(r.headers.get("Cache-Control"), "no-store");
});

test("로그인: 틀린 토큰은 401 이고 쿠키를 지운다, 깨진 요청은 400", async () => {
  const bad = await login({ request: req("/api/login", { method: "POST", body: JSON.stringify({ token: "nope" }) }), env: await env() });
  assert.equal(bad.status, 401);
  assert.ok(bad.headers.get("Set-Cookie").includes("Max-Age=0"));
  const broken = await login({ request: req("/api/login", { method: "POST", body: "not json" }), env: await env() });
  assert.equal(broken.status, 400);
});

test("로그아웃은 쿠키를 지우고 /api/me 는 통과 후 ok", async () => {
  assert.ok((await logout()).headers.get("Set-Cookie").includes("Max-Age=0"));
  assert.deepEqual(await (await me()).json(), { ok: true });
});

// ---------- DB 중계 ----------

const fakeFetch = (log) => async (url, init) => {
  log.push({ url, init });
  return new Response('[{"key":"k"}]', { status: 200, headers: { "content-type": "application/json", "x-secret": "no", "content-range": "0-0/1" } });
};

test("DB 중계: 허용 테이블만, 서버가 토큰을 붙이고 클라이언트가 보낸 토큰·키는 무시한다", async () => {
  const log = [];
  const request = req("/api/db/nw_pages?select=key&order=fetched_at.desc", {
    headers: { "x-nw-token": "client-supplied", apikey: "client-key", Authorization: "Bearer client", Prefer: "count=exact", Range: "0-9" },
  });
  const { response } = await proxyDb({ request, env: await env(), token: TOKEN, parts: ["nw_pages"], fetchImpl: fakeFetch(log) });
  assert.equal(log[0].url, "https://db.example/rest/v1/nw_pages?select=key&order=fetched_at.desc");
  const sent = log[0].init.headers;
  assert.equal(sent.get("x-nw-token"), TOKEN);
  assert.equal(sent.get("apikey"), "sb_publishable_x");
  assert.equal(sent.get("Authorization"), null);
  assert.equal(sent.get("Prefer"), "count=exact");
  assert.equal(sent.get("Range"), "0-9");
  assert.equal(response.headers.get("x-secret"), null);            // 허용 목록 밖 응답 헤더는 버린다
  assert.equal(response.headers.get("content-range"), "0-0/1");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), [{ key: "k" }]);
});

test("DB 중계: 옛 JWT 형식 키는 Authorization 도 보낸다", async () => {
  const log = [];
  await proxyDb({ request: req("/api/db/nw_jobs"), env: await env({ SUPABASE_ANON_KEY: "eyJhbGciOi.x.y" }), token: TOKEN, parts: ["nw_jobs"], fetchImpl: fakeFetch(log) });
  assert.equal(log[0].init.headers.get("Authorization"), "Bearer eyJhbGciOi.x.y");
});

test("DB 중계: 다른 앱 테이블·하위 경로·rpc·허용 밖 메서드는 막는다", async () => {
  const log = [];
  for (const parts of [["pd_admin_credentials"], ["nw_pages", "extra"], ["rpc"], []]) {
    const r = await proxyDb({ request: req("/api/db/x"), env: await env(), token: TOKEN, parts, fetchImpl: fakeFetch(log) });
    assert.equal(r.status, 404, parts.join("/"));
  }
  const put = await proxyDb({ request: req("/api/db/nw_pages", { method: "PUT", body: "{}" }), env: await env(), token: TOKEN, parts: ["nw_pages"], fetchImpl: fakeFetch(log) });
  assert.equal(put.status, 405);
  assert.equal(log.length, 0, "상위로 아무 요청도 나가지 않아야 한다");
});

test("DB 중계: 본문을 그대로 전달하고 설정이 없으면 503", async () => {
  const log = [];
  const request = req("/api/db/nw_pages", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }, body: '{"key":"k"}' });
  await proxyDb({ request, env: await env(), token: TOKEN, parts: ["nw_pages"], fetchImpl: fakeFetch(log) });
  assert.equal(log[0].init.method, "POST");
  assert.equal(await new Response(log[0].init.body).text(), '{"key":"k"}');
  assert.equal(log[0].init.headers.get("Prefer"), "resolution=merge-duplicates");
  const missing = await proxyDb({ request, env: {}, token: TOKEN, parts: ["nw_pages"], fetchImpl: fakeFetch(log) });
  assert.equal(missing.status, 503);
});

// ---------- 스킨 프록시 ----------

test("skinUrl: 허용 확장자와 안전한 경로만", () => {
  assert.equal(skinUrl("espejo/abc.css"), "https://namu.wiki/skins/espejo/abc.css");
  assert.equal(skinUrl("espejo/abc.woff2"), "https://namu.wiki/skins/espejo/abc.woff2");
  for (const bad of ["../x.css", "espejo/../../etc.css", "espejo/a.php", "/abs.css", "espejo/a.css?x=1", "https://evil/a.css", "", null, "a//b.css"]) {
    assert.equal(skinUrl(bad), null, String(bad));
  }
});

test("fetchSkin: 엣지 캐시를 먼저 보고, 없으면 받아서 불변 캐시 헤더로 저장한다", async () => {
  const store = new Map();
  const cache = { match: async (k) => store.get(k.url), put: async (k, v) => { store.set(k.url, v); } };
  let calls = 0;
  const upstream = async () => { calls++; return new Response("body{}", { status: 200 }); };
  const first = await fetchSkin({ path: "espejo/a.css", fetchImpl: upstream, cache });
  assert.equal(first.response.headers.get("Content-Type"), "text/css; charset=utf-8");
  assert.ok(first.response.headers.get("Cache-Control").includes("immutable"));
  assert.equal(await first.response.text(), "body{}");
  const second = await fetchSkin({ path: "espejo/a.css", fetchImpl: upstream, cache });
  assert.equal(await second.response.text(), "body{}");
  assert.equal(calls, 1);
});

test("fetchSkin: 나쁜 경로 400, 상위 오류는 404/502 로 구분", async () => {
  assert.equal((await fetchSkin({ path: "../a.css" })).status, 400);
  assert.equal((await fetchSkin({ path: "espejo/a.css", fetchImpl: async () => new Response("", { status: 404 }) })).status, 404);
  assert.equal((await fetchSkin({ path: "espejo/a.css", fetchImpl: async () => new Response("", { status: 403 }) })).status, 502);
});
