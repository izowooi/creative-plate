export type SegmentPlan = {
  index: number;
  duration: number;
  prompt: string;
  status?: string;
  attempts?: number;
  error?: string | null;
  outputFile?: string | null;
};

export type ClipPlan = {
  id: string;
  title: string;
  originalPrompt: string;
  startMode: "text" | "image";
  targetLength: number;
  segmentDuration: number;
  resolution: "480p" | "720p";
  aspectRatio: string;
  createdAt: number;
  estimatedOutputSeconds: number;
  estimatedSeedInputSeconds: number;
  segments: SegmentPlan[];
};

export type RunManifest = {
  id: string;
  plan: ClipPlan;
  status: string;
  currentSegment: number;
  finalFile: string | null;
  error: string | null;
};

export type AuthStatus = {
  loggedIn: boolean;
  email: string | null;
  expiresAt: number | null;
  path: string;
};

export async function authStatus(): Promise<AuthStatus> {
  const res = await fetch("/api/auth/status");
  return res.json();
}

export async function startLogin(): Promise<{ sessionId: string; userCode: string; verificationUrl: string; expiresIn: number }> {
  const res = await fetch("/api/auth/login", { method: "POST" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "로그인을 시작하지 못했습니다.");
  return res.json();
}

export async function pollLogin(sessionId: string): Promise<{ status: string; error?: string }> {
  const res = await fetch(`/api/auth/login/${encodeURIComponent(sessionId)}`);
  return res.json();
}

export async function createPlan(payload: {
  prompt: string;
  startImageB64?: string | null;
  startImageMime?: string | null;
  targetLength: number;
  resolution: string;
  aspectRatio: string;
}): Promise<ClipPlan> {
  const res = await fetch("/api/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "계획 생성에 실패했습니다.");
  return data.plan;
}

function parseSseBlock(block: string): { event: string; data: any } | null {
  const event = /^event: (.+)$/m.exec(block)?.[1];
  const raw = /^data: (.+)$/m.exec(block)?.[1];
  if (!event || !raw) return null;
  return { event, data: JSON.parse(raw) };
}

export async function streamSse(
  url: string,
  options: RequestInit,
  onEvent: (event: string, data: any) => void,
): Promise<void> {
  const res = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  if (!res.body) throw new Error("스트림 응답이 비어 있습니다.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const parsed = parseSseBlock(block);
      if (parsed) onEvent(parsed.event, parsed.data);
      boundary = buffer.indexOf("\n\n");
    }
  }
}

export function startRun(plan: ClipPlan, startImageB64: string | null, startImageMime: string | null, onEvent: (event: string, data: any) => void): Promise<void> {
  return streamSse("/api/runs", { method: "POST", body: JSON.stringify({ plan, startImageB64, startImageMime }) }, onEvent);
}

export function resumeRun(runId: string, onEvent: (event: string, data: any) => void): Promise<void> {
  return streamSse(`/api/runs/${encodeURIComponent(runId)}/resume`, { method: "POST", body: "{}" }, onEvent);
}

export async function cancelRun(runId: string): Promise<RunManifest> {
  const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "취소에 실패했습니다.");
  return data.run;
}

export async function getRun(runId: string): Promise<RunManifest> {
  const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "실행 상태를 불러오지 못했습니다.");
  return data.run;
}
