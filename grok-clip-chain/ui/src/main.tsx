import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  authStatus,
  cancelRun,
  createPlan,
  getRun,
  pollLogin,
  resumeRun,
  startLogin,
  startRun,
  type AuthStatus,
  type ClipPlan,
  type RunManifest,
} from "./api";
import "./styles.css";

const ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function statusLabel(status: string | undefined): string {
  if (status === "completed") return "완료";
  if (status === "running") return "실행 중";
  if (status === "failed") return "실패";
  if (status === "pending") return "대기";
  if (status === "paused") return "일시정지";
  return "대기";
}

function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [login, setLogin] = useState<{ sessionId: string; userCode: string; verificationUrl: string } | null>(null);
  const [prompt, setPrompt] = useState("");
  const [targetLength, setTargetLength] = useState(60);
  const [resolution, setResolution] = useState("720p");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [startImage, setStartImage] = useState<string | null>(null);
  const [startImageMime, setStartImageMime] = useState<string | null>(null);
  const [plan, setPlan] = useState<ClipPlan | null>(null);
  const [run, setRun] = useState<RunManifest | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [progress, setProgress] = useState<Record<number, number | null>>({});

  useEffect(() => {
    void authStatus().then(setAuth).catch(() => setAuth(null));
  }, []);

  useEffect(() => {
    if (!login) return;
    const timer = setInterval(() => {
      void pollLogin(login.sessionId).then(async (state) => {
        if (state.status === "complete") {
          clearInterval(timer);
          setLogin(null);
          setAuth(await authStatus());
        }
        if (state.status === "error" || state.status === "expired") {
          clearInterval(timer);
          setMessage(state.error || "로그인 세션이 만료되었습니다.");
        }
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [login]);

  const canPlan = useMemo(() => prompt.trim().length > 0 && !running, [prompt, running]);

  async function handleLogin() {
    setMessage(null);
    setLoginBusy(true);
    try {
      setLogin(await startLogin());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Grok 로그인을 시작하지 못했습니다.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleImage(file: File | null) {
    if (!file) {
      setStartImage(null);
      setStartImageMime(null);
      return;
    }
    setStartImage(await fileToDataUrl(file));
    setStartImageMime(file.type || "image/png");
  }

  async function handlePlan() {
    setMessage(null);
    setPlan(null);
    const next = await createPlan({ prompt, startImageB64: startImage, startImageMime, targetLength, resolution, aspectRatio });
    setPlan(next);
  }

  function updateSegment(index: number, value: string) {
    if (!plan) return;
    setPlan({
      ...plan,
      segments: plan.segments.map((segment) => (segment.index === index ? { ...segment, prompt: value } : segment)),
    });
  }

  function handleRunEvent(event: string, data: any) {
    if (event === "progress") {
      setProgress((current) => ({ ...current, [Number(data.segment)]: data.progress == null ? null : Number(data.progress) }));
    }
    if (event === "segment-start") {
      setPlan((current) => current && {
        ...current,
        segments: current.segments.map((segment) =>
          segment.index === data.segment ? { ...segment, status: "running", attempts: data.attempt } : segment,
        ),
      });
    }
    if (event === "retry") {
      setMessage(`구간 ${data.segment} 재시도 ${data.nextAttempt}/3`);
    }
    if (event === "segment-done") {
      setPlan((current) => current && {
        ...current,
        segments: current.segments.map((segment) =>
          segment.index === data.segment ? { ...segment, status: "completed", outputFile: data.outputFile } : segment,
        ),
      });
    }
    if (event === "paused") {
      setRunning(false);
      setMessage(`구간 ${data.segment}에서 일시정지됨: ${data.error}`);
      void getLatestRun(data.runId);
    }
    if (event === "merge-done") {
      setRunning(false);
      setMessage("최종 mp4가 준비되었습니다.");
      void getLatestRun(data.runId);
    }
    if (event === "error") {
      setRunning(false);
      setMessage(data.error || "실행 중 오류가 발생했습니다.");
    }
  }

  async function getLatestRun(runId: string) {
    setRun(await getRun(runId));
  }

  async function handleRun() {
    if (!plan) return;
    setRunning(true);
    setMessage(null);
    setProgress({});
    await startRun(plan, startImage, startImageMime, handleRunEvent).finally(() => setRunning(false));
  }

  async function handleResume() {
    if (!run) return;
    setRunning(true);
    setMessage(null);
    await resumeRun(run.id, handleRunEvent).finally(() => setRunning(false));
  }

  async function handleCancel() {
    if (!run) return;
    setRun(await cancelRun(run.id));
    setRunning(false);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Grok Clip Chain</h1>
          <p>10초 단위 Grok 연장 체인으로 1분 영상을 만듭니다.</p>
        </div>
        <div className="auth-box">
          <span className={`status-dot ${auth?.loggedIn ? "on" : ""}`} />
          <span>{auth?.loggedIn ? auth.email || "Grok 로그인됨" : "Grok 로그인 필요"}</span>
          <button type="button" onClick={handleLogin} disabled={loginBusy}>{loginBusy ? "연결 중" : "로그인"}</button>
        </div>
      </header>

      {login && (
        <section className="login-panel">
          <strong>{login.userCode}</strong>
          <a href={login.verificationUrl} target="_blank" rel="noreferrer">xAI 인증 열기</a>
          <span>같은 Chrome에서 열면 기존 Grok/xAI 로그인 세션을 사용할 수 있습니다.</span>
        </section>
      )}

      <section className="workspace">
        <div className="input-pane">
          <label>
            <span>전체 프롬프트</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={8} />
          </label>
          <div className="control-grid">
            <label>
              <span>목표 길이</span>
              <select value={targetLength} onChange={(event) => setTargetLength(Number(event.target.value))}>
                {[20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120].map((value) => <option key={value} value={value}>{value}초</option>)}
              </select>
            </label>
            <label>
              <span>해상도</span>
              <select value={resolution} onChange={(event) => setResolution(event.target.value)}>
                <option value="720p">720p</option>
                <option value="480p">480p</option>
              </select>
            </label>
            <label>
              <span>화면비</span>
              <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
                {ASPECTS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <label className="file-control">
            <span>시작 이미지</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleImage(event.target.files?.[0] || null)} />
          </label>
          {startImage && <img className="start-preview" src={startImage} alt="시작 이미지 미리보기" />}
          <div className="actions">
            <button type="button" disabled={!canPlan} onClick={() => void handlePlan()}>계획 만들기</button>
            <button type="button" disabled={!plan || running} onClick={() => void handleRun()}>전체 실행</button>
          </div>
        </div>

        <div className="timeline-pane">
          <div className="timeline-header">
            <div>
              <h2>{plan?.title || "계획"}</h2>
              <p>{plan ? `${plan.estimatedOutputSeconds}초 출력 · seed 입력 ${plan.estimatedSeedInputSeconds}초` : "구간 계획 대기"}</p>
            </div>
            {run?.finalFile && <a className="download" href={`/api/runs/${run.id}/download`}>mp4 다운로드</a>}
          </div>
          <div className="segments">
            {(plan?.segments || []).map((segment) => (
              <article className="segment" key={segment.index}>
                <div className="segment__meta">
                  <strong>{String(segment.index).padStart(2, "0")}</strong>
                  <span>{statusLabel(segment.status)}</span>
                  <span>{progress[segment.index] == null ? "" : `${progress[segment.index]}%`}</span>
                </div>
                <textarea value={segment.prompt} onChange={(event) => updateSegment(segment.index, event.target.value)} rows={4} disabled={running} />
              </article>
            ))}
          </div>
          {run?.status === "paused" && (
            <div className="resume-row">
              <button type="button" disabled={running} onClick={() => void handleResume()}>재개</button>
              <button type="button" disabled={running} onClick={() => void handleCancel()}>취소</button>
            </div>
          )}
        </div>
      </section>

      {message && <div className="toast" role="status">{message}</div>}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
