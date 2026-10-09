// /api/* 전체의 인증 관문. 로그인·로그아웃만 토큰 없이 통과한다.
import { COOKIE_NAME, json, readCookie, sameOrigin, tokenValid } from "../../server/auth.js";

const OPEN_PATHS = new Set(["/api/login", "/api/logout"]);

export async function onRequest(context) {
  const { request, env } = context;
  const { pathname } = new URL(request.url);
  if (!sameOrigin(request)) return json({ error: "허용되지 않은 출처입니다" }, 403);
  if (OPEN_PATHS.has(pathname)) return context.next();

  const token = readCookie(request, COOKIE_NAME);
  const check = await tokenValid(token, env);
  if (check.misconfigured) return json({ error: "서버에 인증 설정이 없습니다" }, 503);
  if (!check.ok) return json({ error: "로그인이 필요합니다" }, 401);
  context.data.token = token;
  return context.next();
}
