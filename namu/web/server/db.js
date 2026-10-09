// Supabase PostgREST 중계. 브라우저는 토큰을 모르고(HttpOnly 쿠키), 이 함수가 x-nw-token 헤더를 붙여 보낸다.
// 허용 테이블은 nw_ 접두어 세 개뿐이고, 실제 권한 판정은 DB 의 RLS 정책(nw_token_ok)이 한 번 더 한다.
export const TABLES = new Set(["nw_pages", "nw_assets", "nw_jobs"]);
const METHODS = new Set(["GET", "HEAD", "POST", "PATCH", "DELETE"]);
const FORWARD_REQUEST_HEADERS = ["content-type", "prefer", "accept", "range"];
const FORWARD_RESPONSE_HEADERS = ["content-type", "content-range"];

export function supabaseHeaders(env, token) {
  const key = env.SUPABASE_ANON_KEY;
  // 새 형식(sb_publishable_...)은 apikey 만, 옛 JWT 형식은 Authorization 도 필요하다
  const headers = { apikey: key, "x-nw-token": token };
  if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export async function proxyDb({ request, env, token, parts, fetchImpl = fetch }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return { status: 503, error: "서버에 Supabase 설정이 없습니다" };
  const table = parts[0];
  if (parts.length !== 1 || !TABLES.has(table)) return { status: 404, error: "허용되지 않은 테이블입니다" };
  if (!METHODS.has(request.method)) return { status: 405, error: "허용되지 않은 메서드입니다" };

  const headers = new Headers(supabaseHeaders(env, token));
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const search = new URL(request.url).search;
  const hasBody = !["GET", "HEAD"].includes(request.method);
  const upstream = await fetchImpl(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${table}${search}`, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    ...(hasBody ? { duplex: "half" } : {}),
  });
  const out = new Headers({ "Cache-Control": "no-store" });
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return { response: new Response(upstream.body, { status: upstream.status, headers: out }) };
}
