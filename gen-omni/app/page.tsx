"use client";

import {
  ArrowDownToLine,
  ArrowRight,
  BadgeCheck,
  Camera,
  Check,
  ChevronRight,
  Clapperboard,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  Play,
  ShieldCheck,
  Sparkles,
  Upload,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import { compressImage, downloadDataVideo, getVideoDuration, trimVideo } from "@/lib/client-media";
import { MAX_EDIT_SECONDS, type OutputQuality, validateUploadDuration } from "@/lib/validation";

type Tab = "studio" | "showcase";
type ApiResult = {
  data: string;
  mimeType: string;
  model: string;
  requestedQuality: OutputQuality;
  generatedQuality: string;
};

const examples = [
  { number: "01", title: "Be the protagonist", copy: "내 얼굴을 레퍼런스로, 카메라와 연기는 그대로.", tone: "coral", icon: Camera },
  { number: "02", title: "Cast any character", copy: "일러스트·피규어·마스코트도 장면 속 배우로.", tone: "blue", icon: Sparkles },
  { number: "03", title: "Keep the performance", copy: "동작, 타이밍, 구도와 오디오는 원본의 결을 유지.", tone: "lime", icon: Clapperboard },
  { number: "04", title: "Direct with words", copy: "한 줄의 추가 연출로 의상, 분위기, 조명을 조정.", tone: "violet", icon: WandSparkles },
];

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("studio");
  const [video, setVideo] = useState<File | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [quality, setQuality] = useState<OutputQuality>("480p");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [apiReady, setApiReady] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/status").then((response) => response.json()).then((data) => setApiReady(Boolean(data.configured))).catch(() => setApiReady(false));
  }, []);

  const videoUrl = useMemo(() => video ? URL.createObjectURL(video) : "", [video]);
  const imageUrl = useMemo(() => image ? URL.createObjectURL(image) : "", [image]);
  const resultUrl = useMemo(() => result ? `data:${result.mimeType};base64,${result.data}` : "", [result]);
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const selectionEnd = Math.min(duration, start + MAX_EDIT_SECONDS);
  const ready = video && image && duration > 0 && !stage;

  async function selectVideo(file?: File) {
    if (!file) return;
    setError("");
    try {
      const nextDuration = await getVideoDuration(file);
      const check = validateUploadDuration(nextDuration);
      if (!check.ok) throw new Error(check.message);
      setVideo(file);
      setDuration(nextDuration);
      setStart(0);
      setResult(null);
    } catch (reason) {
      setVideo(null);
      setDuration(0);
      setError(reason instanceof Error ? reason.message : "영상을 불러오지 못했습니다.");
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>, kind: "video" | "image") {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (kind === "video") void selectVideo(file);
    else if (file?.type.startsWith("image/")) { setImage(file); setResult(null); setError(""); }
  }

  async function generate() {
    if (!video || !image) return;
    setError("");
    setResult(null);
    try {
      setStage(duration > MAX_EDIT_SECONDS ? "10초 구간을 안전하게 추출하는 중" : "미디어를 준비하는 중");
      setProgress(12);
      const [editClip, reference] = await Promise.all([
        trimVideo(video, start, selectionEnd),
        compressImage(image),
      ]);
      setStage("콘텐츠와 캐릭터 적합성을 검사하는 중");
      setProgress(32);
      const form = new FormData();
      form.set("video", editClip);
      form.set("image", reference);
      form.set("quality", quality);
      form.set("prompt", prompt);
      form.set("start", "0");
      form.set("end", String(Math.min(selectionEnd - start, MAX_EDIT_SECONDS)));
      const timer = window.setInterval(() => setProgress((value) => Math.min(value + 2, 88)), 1800);
      setStage("Gemini Omni 1.1이 장면을 다시 캐스팅하는 중");
      const response = await fetch("/api/generate", { method: "POST", body: form });
      window.clearInterval(timer);
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "생성에 실패했습니다.");
      setProgress(100);
      setStage("완성");
      setResult(payload.result);
      window.setTimeout(() => setStage(""), 700);
    } catch (reason) {
      setStage("");
      setProgress(0);
      setError(reason instanceof Error ? reason.message : "작업을 완료하지 못했습니다.");
    }
  }

  return (
    <main>
      <header className="topbar">
        <button className="brand" onClick={() => setTab("studio")} aria-label="SceneShift 홈">
          <span className="brand-mark"><Play size={14} fill="currentColor" /></span>
          <span>SCENE<span>SHIFT</span></span>
        </button>
        <nav aria-label="주요 메뉴">
          <button className={tab === "studio" ? "active" : ""} onClick={() => setTab("studio")}>Studio</button>
          <button className={tab === "showcase" ? "active" : ""} onClick={() => setTab("showcase")}>Omni showcase</button>
        </nav>
        <div className={`api-pill ${apiReady === false ? "offline" : ""}`}>
          <span /> {apiReady === null ? "API 확인 중" : apiReady ? "OMNI 1.1 · READY" : "API KEY 필요"}
        </div>
      </header>

      {tab === "studio" ? (
        <>
          <section className="hero">
            <div className="eyebrow"><span>NEW</span> GEMINI OMNI 1.1 FLASH</div>
            <h1>YOUR FACE.<br /><em>THEIR SCENE.</em></h1>
            <p>좋아하는 장면의 주인공을 나, 혹은 상상 속 캐릭터로.<br />연기와 카메라는 그대로 두고 캐스팅만 바꿔보세요.</p>
            <div className="hero-note"><ShieldCheck size={18} /> 안전 검사 후 시작 · 최대 10초 편집 · 최대 720p</div>
          </section>

          <section className="studio-shell" id="studio">
            <div className="steps"><b>01</b><span>Scene</span><i /><b>02</b><span>Character</span><i /><b>03</b><span>Direct</span><i /><b>04</b><span>Create</span></div>
            <div className="upload-grid">
              <div className="input-block">
                <div className="block-title"><span>01</span><div><h2>Choose a scene</h2><p>1분 미만 영상 · 실제 Omni 편집 구간은 최대 10초</p></div></div>
                {!video ? (
                  <label className="drop-zone video-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, "video")}>
                    <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(event: ChangeEvent<HTMLInputElement>) => void selectVideo(event.target.files?.[0])} />
                    <span className="upload-icon"><Upload size={26} /></span>
                    <strong>Drop your scene here</strong><small>or click to browse · MP4, WebM, MOV</small>
                    <mark>UNDER 60 SECONDS</mark>
                  </label>
                ) : (
                  <div className="media-preview">
                    <video src={videoUrl} controls playsInline />
                    <button className="remove" onClick={() => { setVideo(null); setDuration(0); }} aria-label="영상 제거"><X size={16} /></button>
                    <div className="file-meta"><span>{video.name}</span><b>{formatTime(duration)}</b></div>
                    {duration > MAX_EDIT_SECONDS && <div className="trim-control"><label>편집 시작점 <b>{formatTime(start)}–{formatTime(selectionEnd)}</b></label><input type="range" min="0" max={Math.max(0, duration - MAX_EDIT_SECONDS)} step="0.1" value={start} onChange={(e) => setStart(Number(e.target.value))} /></div>}
                  </div>
                )}
              </div>

              <div className="input-block">
                <div className="block-title"><span>02</span><div><h2>Cast your character</h2><p>나의 사진, 일러스트 또는 좋아하는 캐릭터</p></div></div>
                {!image ? (
                  <label className="drop-zone image-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, "image")}>
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setImage(file); setError(""); } }} />
                    <span className="upload-icon"><ImagePlus size={26} /></span>
                    <strong>Drop a character image</strong><small>얼굴이나 캐릭터가 선명한 이미지</small>
                    <mark>AUTO COMPRESSED</mark>
                  </label>
                ) : (
                  <div className="media-preview image-preview">
                    {/* Blob preview URLs are local and cannot use the Next image optimizer. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl} alt="업로드한 캐릭터" />
                    <button className="remove" onClick={() => setImage(null)} aria-label="이미지 제거"><X size={16} /></button>
                    <div className="file-meta"><span>{image.name}</span><b><BadgeCheck size={15} /> ready</b></div>
                  </div>
                )}
              </div>
            </div>

            <div className="direction-row">
              <div className="prompt-field"><label htmlFor="prompt"><span>03</span> Add direction <small>OPTIONAL</small></label><textarea id="prompt" value={prompt} maxLength={1200} onChange={(event) => setPrompt(event.target.value)} placeholder="예: 원래 의상과 조명을 유지하고, 자연스러운 표정으로…" /><b>{prompt.length}/1200</b></div>
              <div className="quality-field"><label>OUTPUT QUALITY</label><div>{(["360p", "480p", "720p"] as const).map((item) => <button key={item} className={quality === item ? "selected" : ""} onClick={() => setQuality(item)}>{item}{item === "480p" && <small>DEFAULT</small>}</button>)}</div><p>1080p·4K는 비용 보호를 위해 차단됩니다.</p></div>
            </div>

            {error && <div className="error-box"><ShieldCheck size={18} /><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div>}
            {stage && <div className="progress-box"><div><LoaderCircle className={stage === "완성" ? "done" : "spin"} size={22} /><span><b>{stage}</b><small>창을 닫지 마세요. 키는 브라우저에 노출되지 않습니다.</small></span><strong>{progress}%</strong></div><i><span style={{ width: `${progress}%` }} /></i></div>}
            {result && <div className="result-card"><div className="result-copy"><span><Check size={16} /> OMNI OUTPUT</span><h3>Your scene is ready.</h3><p>SynthID가 포함된 {result.generatedQuality} 결과입니다.{result.requestedQuality === "480p" && " 480p 선택은 비용 프리셋이며 현재 미리보기는 Omni 원본 720p입니다."}</p><button onClick={() => downloadDataVideo(result.data, result.mimeType, `sceneshift-${Date.now()}.mp4`)}><ArrowDownToLine size={18} /> Download scene</button></div><video src={resultUrl} controls autoPlay loop playsInline /></div>}

            <button className="create-button" disabled={!ready} onClick={() => void generate()}><span><WandSparkles size={22} /> RECAST THIS SCENE</span><ArrowRight size={22} /></button>
            <div className="trust-row"><span><LockKeyhole size={15} /> API key stays server-side</span><span><ShieldCheck size={15} /> Preflight safety gate</span><span><Zap size={15} /> Gemini Omni 1.1 Flash</span></div>
          </section>
        </>
      ) : <Showcase onCreate={() => setTab("studio")} />}

      <footer><div className="brand"><span className="brand-mark"><Play size={12} fill="currentColor" /></span><span>SCENE<span>SHIFT</span></span></div><p>Built to showcase <b>Gemini Omni 1.1 Flash</b> · Generated video includes Google SynthID.</p><a href="https://ai.google.dev/gemini-api/docs/omni" target="_blank" rel="noreferrer">Official API docs <ChevronRight size={14} /></a></footer>
    </main>
  );
}

function Showcase({ onCreate }: { onCreate: () => void }) {
  return <section className="showcase-page"><div className="showcase-hero"><div className="eyebrow"><span>SHOWCASE</span> ONE MODEL · MANY DIRECTIONS</div><h1>OMNI DOESN&apos;T JUST<br />GENERATE. <em>IT DIRECTS.</em></h1><p>텍스트, 이미지, 영상과 오디오를 함께 이해하는 네이티브 멀티모달 영상 모델.</p><button onClick={onCreate}>TRY THE STUDIO <ArrowRight size={18} /></button></div><div className="showcase-grid">{examples.map(({ number, title, copy, tone, icon: Icon }) => <article key={number} className={tone}><header><span>{number}</span><Icon size={24} /></header><div className="fake-frame"><div className="scan" /><Play size={22} fill="currentColor" /></div><h2>{title}</h2><p>{copy}</p></article>)}</div><div className="capability-strip"><div><b>3–10s</b><span>native output</span></div><div><b>24 FPS</b><span>with audio</span></div><div><b>720p</b><span>app cost ceiling</span></div><div><b>4 MODES</b><span>text · image · video · edit</span></div><div><b>SynthID</b><span>provenance built in</span></div></div></section>;
}
