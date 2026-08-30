const KEY_NAMES = [
  "GEMINI_API_KEY",
  "GEMINI_API_KEY2",
  "GEMINI_API_KEY_2",
  "GOOGLE_AI_API_KEY",
  "GOOGLE_AI_API_KEY2",
  "GOOGLE_AI_API_KEY_2",
  "GOOGLE_API_KEY",
  "GOOGLE_API_KEY2",
  "GOOGLE_API_KEY_2",
] as const;

export function configuredApiKeys(env: Readonly<Record<string, string | undefined>> = process.env): string[] {
  return KEY_NAMES.map((name) => env[name]?.trim()).filter((key): key is string => Boolean(key));
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as { status?: unknown; code?: unknown };
  const raw = candidate.status ?? candidate.code;
  return typeof raw === "number" ? raw : Number(raw) || undefined;
}

function isRetryableKeyError(error: unknown): boolean {
  const status = statusOf(error);
  return status === 401 || status === 403 || status === 429;
}

export async function runWithApiKeyFallback<T>(
  keys: string[],
  task: (key: string, index: number) => Promise<T>,
): Promise<T> {
  if (keys.length === 0) throw new Error("설정된 Google API 키가 없습니다.");

  for (let index = 0; index < Math.min(keys.length, 2); index += 1) {
    try {
      return await task(keys[index], index);
    } catch (error) {
      if (!isRetryableKeyError(error)) throw error;
      if (index === Math.min(keys.length, 2) - 1) break;
    }
  }
  throw new Error("모든 API 키로 요청하지 못했습니다. 키 상태와 quota를 확인해 주세요.");
}
