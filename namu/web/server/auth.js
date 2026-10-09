// 앱 토큰 인증. 토큰 원문은 서버 어디에도 저장하지 않고 SHA-256 해시(환경변수 NW_TOKEN_SHA256)만 비교한다.
export const COOKIE_NAME = "nw_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function readCookie(request, name) {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

// 서버 설정이 없으면 열어 두지 않고 닫는다(fail closed).
export async function tokenValid(token, env) {
  const expected = (env.NW_TOKEN_SHA256 || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) return { ok: false, misconfigured: true };
  if (!token || token.length > 200) return { ok: false };
  return { ok: timingSafeEqual(await sha256Hex(token), expected) };
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearedCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

// 브라우저가 보내는 상태 변경 요청은 같은 출처에서 온 것만 받는다(SameSite 쿠키에 더한 이중 방어).
export function sameOrigin(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("Origin");
  return origin !== null && origin === new URL(request.url).origin;
}
