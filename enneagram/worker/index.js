const MAX_BODY = 16384;
const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...HEADERS, ...extra },
  });
}

async function body(request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new ApiError(415, "content_type", "JSON 형식으로 보내 주세요.");
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY)
    throw new ApiError(413, "too_large", "요청 크기가 너무 큽니다.");
  const reader = request.body?.getReader();
  if (!reader)
    throw new ApiError(400, "invalid_json", "요청 본문이 필요합니다.");
  let bytes = 0;
  const parts = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BODY) {
      await reader.cancel();
      throw new ApiError(413, "too_large", "요청 크기가 너무 큽니다.");
    }
    parts.push(value);
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) {
    data.set(part, offset);
    offset += part.byteLength;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(data));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    return parsed;
  } catch {
    throw new ApiError(400, "invalid_json", "올바른 JSON 객체를 보내 주세요.");
  }
}

export function normalizeId(id) {
  if (typeof id !== "string")
    throw new ApiError(400, "invalid_id", "보관 ID를 입력해 주세요.");
  const normalized = id.trim().normalize("NFC");
  if (
    Array.from(normalized).length < 8 ||
    Array.from(normalized).length > 64 ||
    !/^[\p{L}\p{N}_-]+$/u.test(normalized)
  )
    throw new ApiError(
      400,
      "invalid_id",
      "보관 ID는 8~64자의 문자, 숫자, _ 또는 -로 만들어 주세요.",
    );
  return normalized;
}

export function validateAnswers(answers) {
  if (
    !answers ||
    typeof answers !== "object" ||
    Array.isArray(answers) ||
    Object.keys(answers).length > 54
  )
    throw new ApiError(
      400,
      "invalid_answers",
      "응답 형식이 올바르지 않습니다.",
    );
  for (const [key, value] of Object.entries(answers)) {
    if (
      !/^q([1-9]|[1-4][0-9]|5[0-4])$/.test(key) ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 5
    )
      throw new ApiError(
        400,
        "invalid_answers",
        "응답은 q1~q54와 1~5의 정수여야 합니다.",
      );
  }
  return answers;
}

export function validateResult(data) {
  const { scores, primary, wing, profileKey } = data;
  if (
    !Array.isArray(scores) ||
    scores.length !== 9 ||
    scores.some(
      (value) =>
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 100,
    )
  )
    throw new ApiError(400, "invalid_result", "9개 유형 점수가 필요합니다.");
  if (
    primary === null &&
    wing === null &&
    profileKey === null &&
    Math.max(...scores) - Math.min(...scores) <= 4.2 + 1e-9
  )
    return { scores, primary, wing, profileKey };
  if (
    !Number.isInteger(primary) ||
    primary < 1 ||
    primary > 9 ||
    scores[primary - 1] !== Math.max(...scores)
  )
    throw new ApiError(
      400,
      "invalid_result",
      "주유형과 점수가 일치하지 않습니다.",
    );
  const adjacent = [
    primary === 1 ? 9 : primary - 1,
    primary === 9 ? 1 : primary + 1,
  ];
  if (wing !== null && !adjacent.includes(wing))
    throw new ApiError(400, "invalid_result", "날개는 인접 유형이어야 합니다.");
  if (profileKey !== (wing === null ? String(primary) : `${primary}w${wing}`))
    throw new ApiError(
      400,
      "invalid_result",
      "결과 프로필이 일치하지 않습니다.",
    );
  return { scores, primary, wing, profileKey };
}

async function hash(value) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function rpc(env, name, data) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY)
    throw new ApiError(
      503,
      "unavailable",
      "서버 보관 기능이 준비되지 않았습니다. 기기에 저장된 응답은 유지됩니다.",
    );
  let response;
  try {
    const headers = {
      apikey: env.SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    };
    if (!env.SUPABASE_ANON_KEY.startsWith("sb_publishable_"))
      headers.Authorization = `Bearer ${env.SUPABASE_ANON_KEY}`;
    response = await fetch(
      `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/${name}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch {
    throw new ApiError(
      503,
      "unavailable",
      "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(503, "unavailable", "서버 응답을 읽지 못했습니다.");
  }
  if (!response.ok)
    throw new ApiError(
      503,
      "unavailable",
      "서버 보관에 실패했습니다. 기기에 저장된 응답은 유지됩니다.",
    );
  if (result?.error === "rate_limit")
    throw new ApiError(
      429,
      "rate_limit",
      "요청이 너무 많습니다. 1분 후 다시 시도해 주세요.",
    );
  if (result?.error === "invalid_input")
    throw new ApiError(400, "invalid_input", "요청 값이 올바르지 않습니다.");
  return result;
}

function method(request, expected) {
  if (request.method !== expected)
    throw new ApiError(
      405,
      "method_not_allowed",
      "지원하지 않는 요청 방식입니다.",
    );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS
        ? env.ASSETS.fetch(request)
        : new Response("Not found", { status: 404 });
    }
    try {
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin)
        throw new ApiError(403, "origin", "같은 사이트에서 요청해 주세요.");
      if (env.API_LIMITER) {
        const { success } = await env.API_LIMITER.limit({
          key: request.headers.get("CF-Connecting-IP") || "unknown",
        });
        if (!success)
          throw new ApiError(
            429,
            "rate_limit",
            "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
          );
      }
      if (url.pathname === "/api/health") {
        method(request, "GET");
        return json({
          ok: true,
          storage: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
        });
      }
      if (
        url.pathname === "/api/session/load" ||
        url.pathname === "/api/session/save" ||
        url.pathname === "/api/session"
      ) {
        method(request, url.pathname === "/api/session" ? "DELETE" : "POST");
        const input = await body(request);
        const identityHash = await hash(
          `enneagram:v1:${normalizeId(input.id)}`,
        );
        const args = { p_identity_hash: identityHash };
        let result;
        if (url.pathname.endsWith("/load"))
          result = await rpc(env, "enneagram_session_load", args);
        else if (url.pathname.endsWith("/save")) {
          validateAnswers(input.answers);
          if (
            !Number.isSafeInteger(input.revision) ||
            input.revision < 0 ||
            input.revision > 2147483646
          )
            throw new ApiError(
              400,
              "invalid_revision",
              "저장 버전이 올바르지 않습니다.",
            );
          result = await rpc(env, "enneagram_session_save", {
            ...args,
            p_answers: input.answers,
            p_revision: input.revision,
          });
        } else result = await rpc(env, "enneagram_session_delete", args);
        if (result?.error === "conflict") return json(result, 409);
        return json(result);
      }
      if (url.pathname === "/api/share") {
        method(request, "POST");
        const result = validateResult(await body(request));
        const clientHash = await hash(
          `enneagram:share:${request.headers.get("CF-Connecting-IP") || "unknown"}:${new Date().toISOString().slice(0, 10)}`,
        );
        return json(
          await rpc(env, "enneagram_share_create", {
            p_scores: result.scores,
            p_primary: result.primary,
            p_wing: result.wing,
            p_profile_key: result.profileKey,
            p_client_hash: clientHash,
          }),
          201,
        );
      }
      if (url.pathname.startsWith("/api/share/")) {
        method(request, "GET");
        const id = url.pathname.slice("/api/share/".length);
        if (
          !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
            id,
          )
        )
          throw new ApiError(404, "not_found", "공유 결과를 찾을 수 없습니다.");
        const result = await rpc(env, "enneagram_share_get", { p_id: id });
        if (!result)
          throw new ApiError(404, "not_found", "공유 결과를 찾을 수 없습니다.");
        return json(result);
      }
      if (url.pathname === "/api/profiles") {
        method(request, "GET");
        return json(await rpc(env, "enneagram_profiles_get", {}));
      }
      throw new ApiError(404, "not_found", "주소를 찾을 수 없습니다.");
    } catch (error) {
      if (error instanceof ApiError)
        return json(
          { error: error.code, message: error.message },
          error.status,
          error.status === 429 ? { "Retry-After": "60" } : {},
        );
      return json(
        {
          error: "internal",
          message:
            "처리 중 문제가 발생했습니다. 기기에 저장된 응답은 유지됩니다.",
        },
        500,
      );
    }
  },
};
