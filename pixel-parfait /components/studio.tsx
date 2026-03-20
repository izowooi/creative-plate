"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import {
  FormEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  ASPECT_RATIOS,
  DEFAULT_ADVANCED_SETTINGS,
  DEFAULT_SELECTED_MODELS,
  type AdvancedSettings,
  type GeneratePredictionResponse,
  type ModelId,
  type PredictionSnapshot,
} from "@/lib/contracts";
import { MODEL_LIST, MODEL_LOOKUP } from "@/lib/models";
import { estimateBundleUsd, estimateModelUsd, formatUsd } from "@/lib/pricing";

const LOADING_LINES = [
  "파르페 잔에 픽셀을 층층이 올리는 중입니다.",
  "모델들이 같은 프롬프트를 각자 다른 미감으로 해석하고 있어요.",
  "빛, 구도, 운을 한 번에 모아보는 중입니다.",
  "잠시만요. 지금 가장 그럴듯한 한 장을 고르고 있습니다.",
  "붓 대신 토큰으로 디테일을 다듬는 중이에요.",
];

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "canceled"]);

type JobState = {
  phase: "submitting" | "polling" | "complete";
  createdAt: number;
  totalEstimateUsd: number;
  predictions: PredictionSnapshot[];
};

export function Studio() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECT_RATIOS)[number]>("4:3");
  const [selectedModels, setSelectedModels] = useState<ModelId[]>(DEFAULT_SELECTED_MODELS);
  const [advancedSettings, setAdvancedSettings] = useState<AdvancedSettings>(DEFAULT_ADVANCED_SETTINGS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [job, setJob] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<"idle" | "zip" | "single">("idle");
  const [loadingIndex, setLoadingIndex] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [isLoggingOut, startLogoutTransition] = useTransition();

  const estimatedTotal = useMemo(
    () => estimateBundleUsd(selectedModels, advancedSettings, aspectRatio),
    [advancedSettings, aspectRatio, selectedModels],
  );

  const successfulPredictions = job?.predictions.filter((prediction) => prediction.status === "succeeded") ?? [];

  const pollStatuses = useEffectEvent(async () => {
    if (!job || job.phase !== "polling") {
      return;
    }

    const ids = job.predictions.map((prediction) => prediction.id).join(",");
    const response = await fetch(`/api/predictions?ids=${encodeURIComponent(ids)}`, {
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as
      | { predictions?: PredictionSnapshot[]; error?: string }
      | null;

    if (!response.ok || !data?.predictions) {
      setError(data?.error ?? "상태를 갱신하지 못했습니다.");
      return;
    }

    const nextPredictions = data.predictions;

    setJob((current) => {
      if (!current) {
        return current;
      }

      const byId = new Map(nextPredictions.map((prediction) => [prediction.id, prediction]));
      const predictions = current.predictions.map((prediction) => byId.get(prediction.id) ?? prediction);
      const allComplete = predictions.every((prediction) => TERMINAL_STATUSES.has(prediction.status));

      return {
        ...current,
        phase: allComplete ? "complete" : "polling",
        predictions,
      };
    });
  });

  useEffect(() => {
    if (job?.phase !== "polling") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void pollStatuses();
    }, 2200);

    return () => window.clearTimeout(timeoutId);
  }, [job?.phase, job?.predictions]);

  const rotateLoadingCopy = useEffectEvent(() => {
    setLoadingIndex((current) => (current + 1) % LOADING_LINES.length);
  });

  useEffect(() => {
    if (!job || (job.phase !== "submitting" && job.phase !== "polling")) {
      return;
    }

    const intervalId = window.setInterval(() => {
      rotateLoadingCopy();
    }, 2800);

    return () => window.clearInterval(intervalId);
  }, [job]);

  function toggleModel(modelId: ModelId) {
    setError(null);

    setSelectedModels((current) => {
      if (current.includes(modelId)) {
        return current.filter((id) => id !== modelId);
      }

      if (current.length >= 4) {
        setError("모델은 한 번에 최대 4개까지만 선택할 수 있습니다.");
        return current;
      }

      return [...current, modelId];
    });
  }

  function updateAdvanced<K extends keyof AdvancedSettings>(
    modelId: K,
    patch: Partial<AdvancedSettings[K]>,
  ) {
    setAdvancedSettings((current) => ({
      ...current,
      [modelId]: {
        ...current[modelId],
        ...patch,
      },
    }));
  }

  function resetSession() {
    setJob(null);
    setError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (selectedModels.length === 0) {
      setError("최소 1개 모델은 선택해 주세요.");
      return;
    }

    if (prompt.trim().length < 10) {
      setError("프롬프트를 조금만 더 자세히 적어 주세요.");
      return;
    }

    const payload = {
      prompt,
      aspectRatio,
      selectedModels,
      advancedSettings,
    };

    startTransition(async () => {
      setJob({
        phase: "submitting",
        createdAt: Date.now(),
        totalEstimateUsd: estimatedTotal,
        predictions: selectedModels.map((modelId) => ({
          id: `pending-${modelId}`,
          modelId,
          status: "starting",
          estimateUsd: estimateModelUsd(modelId, advancedSettings, aspectRatio),
          outputUrls: [],
          logs: "",
          error: null,
          webUrl: undefined,
          metrics: null,
        })),
      });

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => null)) as
        | (GeneratePredictionResponse & { error?: string })
        | null;

      if (!response.ok || !data?.predictions) {
        setJob(null);
        setError(data?.error ?? "생성 요청을 시작하지 못했습니다.");
        return;
      }

      setJob({
        phase: "polling",
        createdAt: Date.now(),
        totalEstimateUsd: data.totalEstimateUsd,
        predictions: data.predictions,
      });
    });
  }

  async function handleLogout() {
    startLogoutTransition(async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      router.refresh();
    });
  }

  async function downloadPrediction(prediction: PredictionSnapshot) {
    if (!prediction.outputUrls[0]) {
      return;
    }

    try {
      setDownloadState("single");
      const fileName = buildFilename(prediction, 0);
      const response = await fetch(
        `/api/file?url=${encodeURIComponent(prediction.outputUrls[0])}&filename=${encodeURIComponent(fileName)}`,
      );

      if (!response.ok) {
        throw new Error("이미지를 내려받지 못했습니다.");
      }

      const blob = await response.blob();
      triggerBrowserDownload(blob, fileName);
    } catch (downloadError) {
      const message =
        downloadError instanceof Error ? downloadError.message : "이미지 다운로드에 실패했습니다.";
      setError(message);
    } finally {
      setDownloadState("idle");
    }
  }

  async function downloadAllAsZip() {
    if (!successfulPredictions.length) {
      return;
    }

    try {
      setDownloadState("zip");
      const zip = new JSZip();

      for (const prediction of successfulPredictions) {
        for (const [index, url] of prediction.outputUrls.entries()) {
          const fileName = buildFilename(prediction, index);
          const response = await fetch(
            `/api/file?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(fileName)}`,
          );

          if (!response.ok) {
            throw new Error(`${MODEL_LOOKUP[prediction.modelId].name} 이미지를 가져오지 못했습니다.`);
          }

          zip.file(fileName, await response.arrayBuffer());
        }
      }

      const blob = await zip.generateAsync({ type: "blob" });
      triggerBrowserDownload(blob, `pixel-parfait-${new Date().toISOString().slice(0, 19)}.zip`);
    } catch (downloadError) {
      const message =
        downloadError instanceof Error ? downloadError.message : "ZIP 다운로드에 실패했습니다.";
      setError(message);
    } finally {
      setDownloadState("idle");
    }
  }

  return (
    <section className="w-full">
      <div className="glass-card grid-fade overflow-hidden rounded-[2rem]">
        <div className="flex flex-col gap-6 p-5 sm:p-7 lg:p-8">
          <header className="dashed-divider flex flex-col gap-5 pb-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/65 px-3 py-1 text-sm text-[var(--muted)]">
                <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                Replicate multi-model image studio
              </div>
              <div className="space-y-3">
                <p className="text-sm uppercase tracking-[0.28em] text-[var(--muted)]">Pixel Parfait</p>
                <h1 className="fancy-title text-4xl leading-none font-semibold tracking-tight sm:text-5xl">
                  한 프롬프트를 여러 모델에 동시에 보내고,
                  <br className="hidden sm:block" /> 가장 마음에 드는 결과를 바로 고르세요.
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-[var(--muted)] sm:text-base">
                  서버에는 결과를 저장하지 않습니다. 지금 보이는 세션에서만 확인하고, 마음에 들면
                  바로 다운로드하세요.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[23rem]">
              <StatCard label="선택 모델" value={`${selectedModels.length}개`} note="최대 4개" />
              <StatCard label="예상 비용" value={formatUsd(estimatedTotal)} note="현재 선택 기준" />
              <button
                className="rounded-3xl border border-[var(--border)] bg-white/70 px-4 py-4 text-left transition hover:bg-white"
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
              >
                <p className="text-sm text-[var(--muted)]">세션</p>
                <p className="mt-1 text-lg font-semibold tracking-tight">
                  {isLoggingOut ? "닫는 중..." : "로그아웃"}
                </p>
              </button>
            </div>
          </header>

          <form className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]" onSubmit={handleSubmit}>
            <div className="space-y-6">
              <section className="rounded-[1.75rem] border border-[var(--border)] bg-white/70 p-5 sm:p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight">프롬프트</h2>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        인물, 분위기, 카메라, 재질, 텍스트 삽입 등 원하는 요소를 자연스럽게 적어주세요.
                      </p>
                    </div>
                    <button
                      className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] transition hover:bg-white"
                      type="button"
                      onClick={() =>
                        setPrompt(
                          'A cinematic dessert shop interior at dusk, warm amber lighting, glossy parfait glass in the foreground, elegant Korean signage that reads "Pixel Parfait", photographed like a premium editorial campaign.',
                        )
                      }
                    >
                      예시 넣기
                    </button>
                  </div>
                  <textarea
                    className="min-h-44 w-full rounded-[1.5rem] border border-[var(--border)] bg-[rgba(255,255,255,0.88)] px-4 py-4 text-base leading-7 outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[color:rgba(201,109,68,0.12)]"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="예: ultra realistic editorial portrait, soft morning light, handmade ceramic cup with tiny engraved lettering..."
                  />
                </div>
              </section>

              <section className="rounded-[1.75rem] border border-[var(--border)] bg-white/70 p-5 sm:p-6">
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">모델 선택</h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      같은 프롬프트를 서로 다른 모델에 보내 결과 감각을 비교합니다.
                    </p>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {MODEL_LIST.map((model) => {
                      const selected = selectedModels.includes(model.id);
                      const estimate = estimateModelUsd(model.id, advancedSettings, aspectRatio);

                      return (
                        <button
                          key={model.id}
                          className={`rounded-[1.5rem] border px-4 py-4 text-left transition ${
                            selected
                              ? "border-[var(--accent)] bg-[rgba(201,109,68,0.08)] shadow-[0_16px_40px_rgba(201,109,68,0.12)]"
                              : "border-[var(--border)] bg-white/65 hover:bg-white"
                          }`}
                          type="button"
                          onClick={() => toggleModel(model.id)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                                {model.provider}
                              </p>
                              <h3 className="mt-2 text-xl font-semibold tracking-tight">{model.name}</h3>
                            </div>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                                selected ? "bg-[var(--foreground)] text-white" : "bg-white text-[var(--muted)]"
                              }`}
                            >
                              {model.lane}
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{model.description}</p>
                          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                            <span className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--muted)]">
                              예상 {formatUsd(estimate)}
                            </span>
                            <span className="font-medium text-[var(--foreground)]">
                              {selected ? "선택됨" : "클릭해서 추가"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section className="rounded-[1.75rem] border border-[var(--border)] bg-white/70 p-5 sm:p-6">
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">기본 설정</h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      초보자라면 여기까지만 설정해도 충분합니다.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-[var(--muted)]">화면 비율</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {ASPECT_RATIOS.map((ratio) => (
                        <button
                          key={ratio}
                          className={`rounded-2xl border px-3 py-3 text-sm font-medium transition ${
                            aspectRatio === ratio
                              ? "border-[var(--teal)] bg-[rgba(63,123,130,0.08)] text-[var(--foreground)]"
                              : "border-[var(--border)] bg-white/60 text-[var(--muted)] hover:bg-white"
                          }`}
                          type="button"
                          onClick={() => setAspectRatio(ratio)}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-[var(--border)] bg-[rgba(255,255,255,0.66)] p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-[var(--muted)]">비용 미리보기</p>
                        <p className="mt-1 text-2xl font-semibold tracking-tight">{formatUsd(estimatedTotal)}</p>
                      </div>
                      <div className="text-right text-sm leading-6 text-[var(--muted)]">
                        <p>선택한 모델 {selectedModels.length}개 기준</p>
                        <p>Replicate 공개 가격표 기반 추정치</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[1.75rem] border border-[var(--border)] bg-white/70 p-5 sm:p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight">고급 옵션</h2>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        필요할 때만 펼쳐서 모델별 해상도나 출력 포맷을 조정하세요.
                      </p>
                    </div>
                    <button
                      className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] transition hover:bg-white"
                      type="button"
                      onClick={() => setAdvancedOpen((current) => !current)}
                    >
                      {advancedOpen ? "접기" : "펼치기"}
                    </button>
                  </div>

                  {advancedOpen ? (
                    <div className="space-y-4">
                      {selectedModels.map((modelId) => (
                        <AdvancedPanel
                          key={modelId}
                          modelId={modelId}
                          settings={advancedSettings}
                          onChange={updateAdvanced}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[1.35rem] border border-dashed border-[var(--border)] bg-white/45 px-4 py-4 text-sm leading-6 text-[var(--muted)]">
                      대부분의 사용자는 기본 설정만으로도 충분합니다. 더 세밀하게 제어하고 싶을 때만
                      열어 주세요.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[1.75rem] border border-[var(--border)] bg-[rgba(31,25,21,0.96)] p-5 text-white sm:p-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-white/60">Run</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                      {selectedModels.length}개 모델로 지금 생성하기
                    </h2>
                  </div>

                  {error ? (
                    <div className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-sm text-white/85">
                      {error}
                    </div>
                  ) : null}

                  <button
                    className="w-full rounded-full bg-[var(--accent)] px-5 py-3 text-base font-semibold text-white transition hover:translate-y-[-1px] hover:bg-[#ba623d] disabled:cursor-not-allowed disabled:opacity-60"
                    type="submit"
                    disabled={isPending}
                  >
                    {isPending ? "주문 넣는 중..." : `${formatUsd(estimatedTotal)} 정도로 그려보기`}
                  </button>

                  <p className="text-sm leading-6 text-white/60">
                    결과는 저장되지 않습니다. 만족스러운 이미지가 나오면 바로 다운로드하세요.
                  </p>
                </div>
              </section>
            </div>
          </form>

          {job ? (
            <section className="rounded-[1.75rem] border border-[var(--border)] bg-white/75 p-5 sm:p-6">
              <div className="space-y-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">Session</p>
                    <h2 className="text-2xl font-semibold tracking-tight">
                      {job.phase === "complete" ? "이번 라운드 결과" : "모델들이 작업 중입니다"}
                    </h2>
                    <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">
                      {job.phase === "complete"
                        ? "결과는 현재 세션에서만 유지됩니다. 필요하면 지금 바로 ZIP으로 내려받으세요."
                        : LOADING_LINES[loadingIndex]}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-white"
                      type="button"
                      onClick={resetSession}
                    >
                      새 라운드 준비
                    </button>
                    <button
                      className="rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2a221d] disabled:cursor-not-allowed disabled:opacity-55"
                      type="button"
                      onClick={downloadAllAsZip}
                      disabled={!successfulPredictions.length || downloadState !== "idle"}
                    >
                      {downloadState === "zip" ? "ZIP 묶는 중..." : "한 번에 다운로드"}
                    </button>
                  </div>
                </div>

                {(job.phase === "submitting" || job.phase === "polling") && (
                  <div className="loader-shimmer h-2 rounded-full" />
                )}

                <div className="grid gap-4 xl:grid-cols-2">
                  {job.predictions.map((prediction) => {
                    const model = MODEL_LOOKUP[prediction.modelId];
                    const primaryImage = prediction.outputUrls[0];
                    const isDone = TERMINAL_STATUSES.has(prediction.status);

                    return (
                      <article
                        key={prediction.id}
                        className="overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-white/70"
                      >
                        <div className="flex flex-col gap-4 p-4 sm:p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">
                                {model.provider}
                              </p>
                              <h3 className="mt-1 text-2xl font-semibold tracking-tight">{model.name}</h3>
                              <p className="mt-1 text-sm text-[var(--muted)]">{model.description}</p>
                            </div>
                            <div className="text-right">
                              <span className="inline-flex rounded-full border border-[var(--border)] px-3 py-1 text-sm text-[var(--muted)]">
                                {prediction.status}
                              </span>
                              <p className="mt-2 text-sm font-medium text-[var(--foreground)]">
                                예상 {formatUsd(prediction.estimateUsd)}
                              </p>
                            </div>
                          </div>

                          <div className="overflow-hidden rounded-[1.25rem] border border-[var(--border)] bg-[rgba(250,246,240,0.8)]">
                            <div className="relative aspect-[4/3]">
                              {primaryImage ? (
                                <Image
                                  src={primaryImage}
                                  alt={`${model.name} result`}
                                  fill
                                  className="object-cover"
                                  sizes="(max-width: 1280px) 100vw, 45vw"
                                  unoptimized
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-[var(--muted)]">
                                  {isDone && prediction.error
                                    ? prediction.error
                                    : "아직 이미지가 도착하기 전입니다. 모델이 열심히 장면을 구성하는 중이에요."}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-sm leading-6 text-[var(--muted)]">
                              {prediction.webUrl ? (
                                <a
                                  className="font-medium text-[var(--foreground)] underline decoration-[rgba(31,25,21,0.24)] underline-offset-4"
                                  href={prediction.webUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Replicate에서 보기
                                </a>
                              ) : (
                                <span>Replicate 링크 준비 중</span>
                              )}
                            </div>

                            <button
                              className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                              type="button"
                              onClick={() => void downloadPrediction(prediction)}
                              disabled={!primaryImage || downloadState !== "idle"}
                            >
                              {downloadState === "single" ? "내려받는 중..." : "이 결과 다운로드"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}

type StatCardProps = {
  label: string;
  value: string;
  note: string;
};

function StatCard({ label, value, note }: StatCardProps) {
  return (
    <div className="rounded-3xl border border-[var(--border)] bg-white/70 px-4 py-4">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">{note}</p>
    </div>
  );
}

type AdvancedPanelProps = {
  modelId: ModelId;
  settings: AdvancedSettings;
  onChange: <K extends keyof AdvancedSettings>(
    modelId: K,
    patch: Partial<AdvancedSettings[K]>,
  ) => void;
};

function AdvancedPanel({ modelId, settings, onChange }: AdvancedPanelProps) {
  const model = MODEL_LOOKUP[modelId];

  if (modelId === "seedream-4") {
    const current = settings["seedream-4"];

    return (
      <div className="rounded-[1.35rem] border border-[var(--border)] bg-white/70 p-4">
        <PanelHeader modelName={model.name} />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <SelectField
            label="해상도"
            value={current.size}
            options={["1K", "2K", "4K"]}
            onChange={(value) => onChange("seedream-4", { size: value as "1K" | "2K" | "4K" })}
          />
          <SelectField
            label="포맷"
            value={current.outputFormat}
            options={["png", "jpeg"]}
            onChange={(value) => onChange("seedream-4", { outputFormat: value as "png" | "jpeg" })}
          />
          <ToggleField
            label="프롬프트 보강"
            checked={current.enhancePrompt}
            onChange={(checked) => onChange("seedream-4", { enhancePrompt: checked })}
          />
        </div>
      </div>
    );
  }

  if (modelId === "seedream-5-lite") {
    const current = settings["seedream-5-lite"];

    return (
      <div className="rounded-[1.35rem] border border-[var(--border)] bg-white/70 p-4">
        <PanelHeader modelName={model.name} />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <SelectField
            label="해상도"
            value={current.size}
            options={["2K", "3K"]}
            onChange={(value) => onChange("seedream-5-lite", { size: value as "2K" | "3K" })}
          />
          <SelectField
            label="포맷"
            value={current.outputFormat}
            options={["png", "jpeg"]}
            onChange={(value) => onChange("seedream-5-lite", {
              outputFormat: value as "png" | "jpeg",
            })}
          />
        </div>
      </div>
    );
  }

  if (modelId === "flux-2-pro") {
    const current = settings["flux-2-pro"];

    return (
      <div className="rounded-[1.35rem] border border-[var(--border)] bg-white/70 p-4">
        <PanelHeader modelName={model.name} />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <SelectField
            label="메가픽셀"
            value={current.resolution}
            options={["0.5 MP", "1 MP", "2 MP"]}
            onChange={(value) =>
              onChange("flux-2-pro", { resolution: value as "0.5 MP" | "1 MP" | "2 MP" })
            }
          />
          <SelectField
            label="포맷"
            value={current.outputFormat}
            options={["webp", "jpg", "png"]}
            onChange={(value) =>
              onChange("flux-2-pro", { outputFormat: value as "webp" | "jpg" | "png" })
            }
          />
          <RangeField
            label="세이프티"
            min={1}
            max={5}
            value={current.safetyTolerance}
            onChange={(value) => onChange("flux-2-pro", { safetyTolerance: value })}
          />
        </div>
      </div>
    );
  }

  if (modelId === "nano-banana-pro") {
    const current = settings["nano-banana-pro"];

    return (
      <div className="rounded-[1.35rem] border border-[var(--border)] bg-white/70 p-4">
        <PanelHeader modelName={model.name} />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <SelectField
            label="해상도"
            value={current.resolution}
            options={["1K", "2K", "4K"]}
            onChange={(value) =>
              onChange("nano-banana-pro", { resolution: value as "1K" | "2K" | "4K" })
            }
          />
          <SelectField
            label="포맷"
            value={current.outputFormat}
            options={["jpg", "png"]}
            onChange={(value) =>
              onChange("nano-banana-pro", { outputFormat: value as "jpg" | "png" })
            }
          />
          <SelectField
            label="세이프티"
            value={current.safetyFilterLevel}
            options={["block_only_high", "block_medium_and_above", "block_low_and_above"]}
            onChange={(value) =>
              onChange("nano-banana-pro", {
                safetyFilterLevel: value as
                  | "block_only_high"
                  | "block_medium_and_above"
                  | "block_low_and_above",
              })
            }
          />
        </div>
      </div>
    );
  }

  const current = settings["z-image-turbo"];

  return (
    <div className="rounded-[1.35rem] border border-[var(--border)] bg-white/70 p-4">
      <PanelHeader modelName={model.name} />
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <SelectField
          label="포맷"
          value={current.outputFormat}
          options={["jpg", "png", "webp"]}
          onChange={(value) =>
            onChange("z-image-turbo", { outputFormat: value as "jpg" | "png" | "webp" })
          }
        />
        <RangeField
          label="스텝"
          min={8}
          max={12}
          value={current.numInferenceSteps}
          onChange={(value) => onChange("z-image-turbo", { numInferenceSteps: value })}
        />
        <ToggleField
          label="추가 가속"
          checked={current.goFast}
          onChange={(checked) => onChange("z-image-turbo", { goFast: checked })}
        />
      </div>
    </div>
  );
}

type PanelHeaderProps = {
  modelName: string;
};

function PanelHeader({ modelName }: PanelHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h3 className="text-base font-semibold tracking-tight">{modelName}</h3>
        <p className="text-sm text-[var(--muted)]">이 모델만의 세부 조절값입니다.</p>
      </div>
    </div>
  );
}

type SelectFieldProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-[var(--muted)]">{label}</span>
      <select
        className="w-full rounded-2xl border border-[var(--border)] bg-white px-3 py-2.5 outline-none transition focus:border-[var(--accent)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

type RangeFieldProps = {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
};

function RangeField({ label, min, max, value, onChange }: RangeFieldProps) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-[var(--muted)]">
        {label} <span className="text-[var(--foreground)]">{value}</span>
      </span>
      <input
        className="w-full accent-[var(--accent)]"
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

type ToggleFieldProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

function ToggleField({ label, checked, onChange }: ToggleFieldProps) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-[var(--muted)]">{label}</span>
      <button
        className={`flex h-[46px] w-full items-center rounded-2xl border px-3 transition ${
          checked
            ? "border-[var(--accent)] bg-[rgba(201,109,68,0.08)]"
            : "border-[var(--border)] bg-white"
        }`}
        type="button"
        onClick={() => onChange(!checked)}
      >
        <span
          className={`inline-flex h-6 w-11 items-center rounded-full p-1 transition ${
            checked ? "bg-[var(--accent)] justify-end" : "bg-[rgba(31,25,21,0.14)] justify-start"
          }`}
        >
          <span className="h-4 w-4 rounded-full bg-white" />
        </span>
        <span className="ml-3 text-sm font-medium text-[var(--foreground)]">
          {checked ? "켜짐" : "꺼짐"}
        </span>
      </button>
    </label>
  );
}

function buildFilename(prediction: PredictionSnapshot, index: number) {
  const model = MODEL_LOOKUP[prediction.modelId];
  const url = prediction.outputUrls[index] ?? prediction.outputUrls[0] ?? "";
  const extension = url.split(".").pop()?.split("?")[0] || "png";
  const slug = `${model.name}-${index + 1}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${slug}.${extension}`;
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
