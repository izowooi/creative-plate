export const STORAGE_KEY = "enneagram-atlas:v1";
export function readLocal(storage) {
  try {
    storage ??= globalThis.localStorage;
    const value = JSON.parse(storage.getItem(STORAGE_KEY));
    if (
      !value ||
      value.version !== 1 ||
      typeof value.answers !== "object" ||
      !value.answers
    )
      return { answers: {}, id: "", revision: 0 };
    const answers = Object.fromEntries(
      Object.entries(value.answers).filter(
        ([k, v]) =>
          /^q([1-9]|[1-4]\d|5[0-4])$/.test(k) &&
          Number.isInteger(v) &&
          v >= 1 &&
          v <= 5,
      ),
    );
    return {
      answers,
      id: typeof value.id === "string" ? value.id : "",
      revision:
        Number.isSafeInteger(value.revision) &&
        value.revision >= 0 &&
        value.revision <= 2147483646
          ? value.revision
          : 0,
    };
  } catch {
    return { answers: {}, id: "", revision: 0 };
  }
}
export function writeLocal(state, storage) {
  try {
    storage ??= globalThis.localStorage;
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        answers: state.answers,
        id: state.id,
        revision: state.revision,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
export async function api(path, data, method = "POST") {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  let result;
  try {
    result = await response.json();
  } catch {
    const error = new Error("unavailable");
    error.status = 503;
    error.data = { error: "unavailable" };
    throw error;
  }
  if (!response.ok) {
    const error = new Error(result.error || "unavailable");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result;
}
