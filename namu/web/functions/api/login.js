import { clearedCookie, json, sessionCookie, tokenValid } from "../../server/auth.js";

export async function onRequestPost({ request, env }) {
  let token = "";
  try {
    token = String((await request.json()).token || "").trim();
  } catch {
    return json({ error: "잘못된 요청입니다" }, 400);
  }
  const check = await tokenValid(token, env);
  if (check.misconfigured) return json({ error: "서버에 인증 설정이 없습니다" }, 503);
  if (!check.ok) return json({ error: "토큰이 올바르지 않습니다" }, 401, { "Set-Cookie": clearedCookie() });
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token) });
}
