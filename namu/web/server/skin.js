// 나무위키 스킨 CSS/폰트 프록시. 브라우저는 CORS 때문에 직접 못 받는다.
// 문서 HTML 은 Cloudflare 에서 차단되지만 /skins/ 정적 파일은 통과한다(실측). 해시가 붙은 불변 파일이라 엣지에 오래 캐시한다.
export const SKIN_PREFIX = "https://namu.wiki/skins/";
// 파일명 안의 점(81.9957bf….css)은 허용하되 비어 있는 조각(.., 앞쪽 점)은 만들 수 없게 조각마다 영숫자로 시작한다
const NAME = "[A-Za-z0-9_-]+";
const PATH_RE = new RegExp(`^(?:${NAME}/)*${NAME}(?:\\.${NAME})*\\.(?:css|woff2|woff|ttf|otf|eot|svg)$`);
const TYPES = { css: "text/css; charset=utf-8", woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf",
  eot: "application/vnd.ms-fontobject", svg: "image/svg+xml" };

export function skinUrl(path) {
  return path && PATH_RE.test(path) ? SKIN_PREFIX + path : null;
}

export async function fetchSkin({ path, fetchImpl = fetch, cache = null }) {
  const target = skinUrl(path);
  if (!target) return { status: 400, error: "허용되지 않은 경로입니다" };
  const cacheKey = new Request(target);
  const hit = cache && (await cache.match(cacheKey));
  if (hit) return { response: hit };
  const upstream = await fetchImpl(target, { headers: { "User-Agent": "Mozilla/5.0 (namu.zowoo.uk)" } });
  if (!upstream.ok) return { status: upstream.status === 404 ? 404 : 502, error: `나무위키 응답 ${upstream.status}` };
  const ext = path.slice(path.lastIndexOf(".") + 1);
  const response = new Response(upstream.body, {
    status: 200,
    headers: { "Content-Type": TYPES[ext], "Cache-Control": "public, max-age=31536000, immutable" },
  });
  if (cache) await cache.put(cacheKey, response.clone());
  return { response };
}
