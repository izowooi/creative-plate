"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import { useEffect, useEffectEvent, useMemo, useState, useTransition } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ASPECT_RATIOS,
  DEFAULT_ADVANCED_SETTINGS,
  DEFAULT_BATCH_MODEL,
  DEFAULT_SELECTED_MODELS,
  type AdvancedSettings,
  type GeneratePredictionResponse,
  type GenerationMode,
  type ModelId,
  type PredictionSnapshot,
} from "@/lib/contracts";
import { MODEL_LIST, MODEL_LOOKUP } from "@/lib/models";
import { estimateBundleUsd, estimateModelUsd, formatUsd } from "@/lib/pricing";

const LOADING_LINES = [
  "같은 프롬프트를 다른 눈으로 보는 중",
  "장면을 조용히 조립하는 중",
  "가장 그럴듯한 빛을 찾는 중",
  "픽셀을 한 층씩 정리하는 중",
];

const MAX_COMPARE_MODELS = 4;
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "canceled"]);

function getAvailableAspectRatios(modelIds: ModelId[]) {
  if (!modelIds.length) {
    return [...ASPECT_RATIOS];
  }

  return ASPECT_RATIOS.filter((ratio) =>
    modelIds.every((modelId) => MODEL_LOOKUP[modelId].supportedAspectRatios.includes(ratio)),
  );
}

type JobState = {
  mode: GenerationMode;
  phase: "submitting" | "polling" | "complete";
  totalEstimateUsd: number;
  predictions: PredictionSnapshot[];
};

export function Studio() {
  const router = useRouter();
  const [mode, setMode] = useState<GenerationMode>("batch");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECT_RATIOS)[number]>("4:3");
  const [selectedModels, setSelectedModels] = useState<ModelId[]>([DEFAULT_BATCH_MODEL]);
  const [imageCount, setImageCount] = useState(4);
  const [advancedSettings, setAdvancedSettings] = useState<AdvancedSettings>(DEFAULT_ADVANCED_SETTINGS);
  const [job, setJob] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<"idle" | "zip" | "single">("idle");
  const [loadingIndex, setLoadingIndex] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [isLoggingOut, startLogoutTransition] = useTransition();
  const activeBatchModel = selectedModels[0] ?? DEFAULT_BATCH_MODEL;
  const availableAspectRatios = useMemo(
    () => getAvailableAspectRatios(mode === "batch" ? [activeBatchModel] : selectedModels),
    [activeBatchModel, mode, selectedModels],
  );

  const estimatedTotal = useMemo(
    () => estimateBundleUsd(mode, selectedModels, imageCount, advancedSettings, aspectRatio),
    [advancedSettings, aspectRatio, imageCount, mode, selectedModels],
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
      const predictions = current.predictions.map((prediction) => {
        const next = byId.get(prediction.id);

        if (!next) {
          return prediction;
        }

        return {
          ...prediction,
          ...next,
          variantIndex: prediction.variantIndex ?? next.variantIndex,
        };
      });

      return {
        ...current,
        phase: predictions.every((prediction) => TERMINAL_STATUSES.has(prediction.status))
          ? "complete"
          : "polling",
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
    }, 2600);

    return () => window.clearInterval(intervalId);
  }, [job]);

  useEffect(() => {
    if (availableAspectRatios.includes(aspectRatio)) {
      return;
    }

    setAspectRatio(availableAspectRatios[0] ?? ASPECT_RATIOS[0]);
  }, [aspectRatio, availableAspectRatios]);

  function handleModeChange(nextMode: GenerationMode) {
    setMode(nextMode);
    setError(null);
    setJob(null);

    if (nextMode === "batch") {
      setSelectedModels((current) => [current[0] ?? DEFAULT_BATCH_MODEL]);
      return;
    }

    setSelectedModels((current) => (current.length ? current : DEFAULT_SELECTED_MODELS));
  }

  function toggleModel(modelId: ModelId) {
    setError(null);

    if (mode === "batch") {
      setSelectedModels([modelId]);
      return;
    }

    setSelectedModels((current) => {
      if (current.includes(modelId)) {
        return current.filter((id) => id !== modelId);
      }

      if (current.length >= MAX_COMPARE_MODELS) {
        setError(`비교 모드는 최대 ${MAX_COMPARE_MODELS}개 모델까지 가능합니다.`);
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

  function submitGeneration() {
    setError(null);

    if (selectedModels.length === 0) {
      setError("모델을 선택해 주세요.");
      return;
    }

    if (prompt.trim().length < 10) {
      setError("프롬프트를 조금 더 구체적으로 적어 주세요.");
      return;
    }

    const incompatibleModels = selectedModels
      .map((modelId) => MODEL_LOOKUP[modelId])
      .filter((model) => !model.supportedAspectRatios.includes(aspectRatio));

    if (incompatibleModels.length) {
      setError(
        `${incompatibleModels.map((model) => model.name).join(", ")} 모델은 ${aspectRatio} 비율을 지원하지 않습니다.`,
      );
      return;
    }

    const payload = {
      prompt,
      mode,
      aspectRatio,
      selectedModels,
      imageCount,
      advancedSettings,
    };

    startTransition(async () => {
      setJob({
        mode,
        phase: "submitting",
        totalEstimateUsd: estimatedTotal,
        predictions:
          mode === "batch"
            ? Array.from({ length: imageCount }, (_, index) => ({
                id: `pending-${index + 1}`,
                modelId: activeBatchModel,
                variantIndex: index + 1,
                status: "starting",
                estimateUsd: estimateModelUsd(activeBatchModel, advancedSettings, aspectRatio),
                outputUrls: [],
                logs: "",
                error: null,
                webUrl: undefined,
                metrics: null,
              }))
            : selectedModels.map((modelId) => ({
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
        setError(data?.error ?? "생성을 시작하지 못했습니다.");
        return;
      }

      setJob({
        mode,
        phase: "polling",
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
      const fileName = buildFilename(prediction);
      const response = await fetch(
        `/api/file?url=${encodeURIComponent(prediction.outputUrls[0])}&filename=${encodeURIComponent(fileName)}`,
      );

      if (!response.ok) {
        throw new Error("이미지를 내려받지 못했습니다.");
      }

      triggerBrowserDownload(await response.blob(), fileName);
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
            throw new Error(`${MODEL_LOOKUP[prediction.modelId].name} 파일을 가져오지 못했습니다.`);
          }

          zip.file(fileName, await response.arrayBuffer());
        }
      }

      const zipName = `pixel-parfait-${new Date().toISOString().slice(0, 19)}.zip`;
      triggerBrowserDownload(await zip.generateAsync({ type: "blob" }), zipName);
    } catch (downloadError) {
      const message =
        downloadError instanceof Error ? downloadError.message : "ZIP 다운로드에 실패했습니다.";
      setError(message);
    } finally {
      setDownloadState("idle");
    }
  }

  const visibleModels = MODEL_LIST;
  const advancedModelIds = (mode === "batch" ? [activeBatchModel] : selectedModels).filter(
    (modelId): modelId is ModelId => Boolean(modelId),
  );

  return (
    <section className="w-full">
      <div className="flex items-center justify-between gap-4 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-[var(--foreground)]" />
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-[var(--muted)]">
              Pixel Parfait
            </p>
            <p className="text-sm text-[var(--muted)]">Replicate</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            className="glass-card rounded-full px-4 py-2 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? "..." : "Logout"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="glass-card rounded-[2rem] p-5">
            <div className="flex items-center gap-2">
              <ModeButton
                active={mode === "batch"}
                label="한 모델 여러 장"
                onClick={() => handleModeChange("batch")}
              />
              <ModeButton
                active={mode === "compare"}
                label="여러 모델 비교"
                onClick={() => handleModeChange("compare")}
              />
            </div>

            <div className="mt-4">
              <textarea
                className="app-textarea min-h-44 rounded-[1.5rem] px-4 py-4 text-base leading-7"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder='예: cinematic product photo, clean studio light, glass dessert cup, tiny lettering "Pixel Parfait"'
              />
            </div>
          </div>

          <div className="glass-card rounded-[2rem] p-5">
            <div className="flex items-center justify-between">
              <SectionLabel label="모델" />
              <span className="text-sm text-[var(--muted)]">
                {mode === "batch" ? "1개" : `${selectedModels.length}/${MAX_COMPARE_MODELS}`}
              </span>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {visibleModels.map((model) => {
                const active = selectedModels.includes(model.id);

                return (
                  <button
                    key={model.id}
                    className={`h-full rounded-[1.5rem] border px-4 py-4 text-left transition ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_18px_36px_rgba(47,111,237,0.08)]"
                        : "border-[var(--border)] bg-[var(--surface-contrast)] hover:border-[var(--accent)]/35 hover:bg-[var(--surface)]"
                    }`}
                    type="button"
                    onClick={() => toggleModel(model.id)}
                  >
                    <div className="flex h-full flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)]">
                              {model.provider}
                            </span>
                            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)]">
                              {model.lane}
                            </span>
                          </div>

                          <div>
                            <p className="text-base font-semibold tracking-tight">{model.name}</p>
                            <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">
                              {model.description}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`mt-1 h-2.5 w-2.5 rounded-full ${
                            active ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                          }`}
                        />
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
                        <span>
                          예상 {formatUsd(estimateModelUsd(model.id, advancedSettings, aspectRatio))}
                        </span>
                        <span>{active ? "선택됨" : "선택"}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {mode === "batch" ? (
              <div className="mt-4">
                <SectionLabel label="장수" />
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((count) => (
                    <button
                      key={count}
                      className={`rounded-2xl border px-3 py-3 text-sm transition ${
                        imageCount === count
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-[var(--border)] bg-[var(--surface-contrast)]"
                      }`}
                      type="button"
                      onClick={() => setImageCount(count)}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="glass-card rounded-[2rem] p-5">
            <SectionLabel label="기본 설정" />

            <div className="mt-3 grid grid-cols-4 gap-2">
              {ASPECT_RATIOS.map((ratio) => {
                const disabled = !availableAspectRatios.includes(ratio);

                return (
                  <button
                    key={ratio}
                    className={`rounded-2xl border px-3 py-3 text-sm transition ${
                      disabled
                        ? "cursor-not-allowed border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]/50"
                        : aspectRatio === ratio
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-[var(--border)] bg-[var(--surface-contrast)]"
                    }`}
                    type="button"
                    disabled={disabled}
                    onClick={() => setAspectRatio(ratio)}
                  >
                    {ratio}
                  </button>
                );
              })}
            </div>

            <details className="mt-4 rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface-contrast)] px-4 py-3">
              <summary className="cursor-pointer list-none text-sm font-medium text-[var(--foreground)]">
                Advanced
              </summary>
              <div className="mt-4 space-y-3">
                {advancedModelIds.filter(Boolean).map((modelId) => (
                  <AdvancedPanel
                    key={modelId}
                    modelId={modelId}
                    settings={advancedSettings}
                    onChange={updateAdvanced}
                  />
                ))}
              </div>
            </details>
          </div>

          <div className="glass-card rounded-[2rem] p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-sm text-[var(--muted)]">Estimate</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight">{formatUsd(estimatedTotal)}</p>
              </div>
              <button
                className="rounded-2xl bg-[var(--foreground)] px-5 py-3 text-sm font-semibold text-[var(--background)] transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-45"
                type="button"
                onClick={submitGeneration}
                disabled={isPending}
              >
                {isPending ? "Generating..." : "Generate"}
              </button>
            </div>

            {error ? (
              <div className="mt-3 rounded-2xl border border-[color:rgba(229,72,77,0.24)] bg-[color:rgba(229,72,77,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="glass-card min-h-[42rem] rounded-[2rem] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-[var(--muted)]">Results</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                {job
                  ? job.phase === "complete"
                    ? "Done"
                    : LOADING_LINES[loadingIndex]
                  : "아직 생성된 이미지 없음"}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {job ? (
                <button
                  className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
                  type="button"
                  onClick={resetSession}
                >
                  Reset
                </button>
              ) : null}
              <button
                className="rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-[var(--background)] transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-45"
                type="button"
                onClick={downloadAllAsZip}
                disabled={!successfulPredictions.length || downloadState !== "idle"}
              >
                {downloadState === "zip" ? "Zipping..." : "Download all"}
              </button>
            </div>
          </div>

          {(job?.phase === "submitting" || job?.phase === "polling") && (
            <div className="loader-shimmer mt-4 h-1.5 rounded-full" />
          )}

          {!job ? (
            <div className="mt-8 flex min-h-[32rem] items-center justify-center rounded-[1.75rem] border border-dashed border-[var(--border)] bg-[var(--surface-contrast)]">
              <p className="text-sm text-[var(--muted)]">프롬프트를 입력하고 생성해 보세요.</p>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {job.predictions.map((prediction) => {
                const model = MODEL_LOOKUP[prediction.modelId];
                const imageUrl = prediction.outputUrls[0];

                return (
                  <article
                    key={prediction.id}
                    className="overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-contrast)]"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden">
                      {imageUrl ? (
                        <Image
                          src={imageUrl}
                          alt={model.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 1536px) 100vw, 30vw"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--muted)]">
                          {prediction.error ?? "생성 중"}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold tracking-tight">
                            {model.name}
                            {prediction.variantIndex ? ` ${prediction.variantIndex}` : ""}
                          </h3>
                          <p className="text-sm text-[var(--muted)]">{prediction.status}</p>
                        </div>
                        <span className="text-sm text-[var(--muted)]">
                          {formatUsd(prediction.estimateUsd)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          className="rounded-full border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                          type="button"
                          onClick={() => void downloadPrediction(prediction)}
                          disabled={!imageUrl || downloadState !== "idle"}
                        >
                          {downloadState === "single" ? "..." : "Download"}
                        </button>
                        {prediction.webUrl ? (
                          <a
                            className="rounded-full border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
                            href={prediction.webUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Replicate
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

type ModeButtonProps = {
  active: boolean;
  label: string;
  onClick: () => void;
};

function ModeButton({ active, label, onClick }: ModeButtonProps) {
  return (
    <button
      className={`rounded-full px-4 py-2 text-sm transition ${
        active ? "bg-[var(--foreground)] text-[var(--background)]" : "text-[var(--muted)]"
      }`}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

type SectionLabelProps = {
  label: string;
};

function SectionLabel({ label }: SectionLabelProps) {
  return <span className="text-sm font-medium text-[var(--muted)]">{label}</span>;
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

  switch (modelId) {
    case "seedream-5-lite": {
      const current = settings["seedream-5-lite"];

      return (
        <div className="rounded-[1rem] border border-[var(--border)] p-3">
          <p className="mb-3 text-sm font-medium">{model.name}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Size"
              value={current.size}
              options={["2K", "3K"]}
              onChange={(value) => onChange("seedream-5-lite", { size: value as "2K" | "3K" })}
            />
            <SelectField
              label="Format"
              value={current.outputFormat}
              options={["png", "jpeg"]}
              onChange={(value) =>
                onChange("seedream-5-lite", { outputFormat: value as "png" | "jpeg" })
              }
            />
          </div>
        </div>
      );
    }
    case "seedream-4": {
      const current = settings["seedream-4"];

      return (
        <div className="rounded-[1rem] border border-[var(--border)] p-3">
          <p className="mb-3 text-sm font-medium">{model.name}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField
              label="Size"
              value={current.size}
              options={["1K", "2K", "4K"]}
              onChange={(value) =>
                onChange("seedream-4", { size: value as "1K" | "2K" | "4K" })
              }
            />
            <SelectField
              label="Format"
              value={current.outputFormat}
              options={["png", "jpeg"]}
              onChange={(value) =>
                onChange("seedream-4", { outputFormat: value as "png" | "jpeg" })
              }
            />
            <ToggleField
              label="Enhance"
              checked={current.enhancePrompt}
              onChange={(checked) => onChange("seedream-4", { enhancePrompt: checked })}
            />
          </div>
        </div>
      );
    }
    case "flux-2-pro": {
      const current = settings["flux-2-pro"];

      return (
        <div className="rounded-[1rem] border border-[var(--border)] p-3">
          <p className="mb-3 text-sm font-medium">{model.name}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField
              label="MP"
              value={current.resolution}
              options={["0.5 MP", "1 MP", "2 MP"]}
              onChange={(value) =>
                onChange("flux-2-pro", { resolution: value as "0.5 MP" | "1 MP" | "2 MP" })
              }
            />
            <SelectField
              label="Format"
              value={current.outputFormat}
              options={["webp", "jpg", "png"]}
              onChange={(value) =>
                onChange("flux-2-pro", { outputFormat: value as "webp" | "jpg" | "png" })
              }
            />
            <RangeField
              label="Safety"
              min={1}
              max={5}
              value={current.safetyTolerance}
              onChange={(value) => onChange("flux-2-pro", { safetyTolerance: value })}
            />
          </div>
        </div>
      );
    }
    case "flux-2-flex": {
      const current = settings["flux-2-flex"];

      return (
        <div className="rounded-[1rem] border border-[var(--border)] p-3">
          <p className="mb-3 text-sm font-medium">{model.name}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="MP"
              value={current.resolution}
              options={["0.5 MP", "1 MP", "2 MP"]}
              onChange={(value) =>
                onChange("flux-2-flex", { resolution: value as "0.5 MP" | "1 MP" | "2 MP" })
              }
            />
            <SelectField
              label="Format"
              value={current.outputFormat}
              options={["webp", "jpg", "png"]}
              onChange={(value) =>
                onChange("flux-2-flex", { outputFormat: value as "webp" | "jpg" | "png" })
              }
            />
            <RangeField
              label="Steps"
              min={6}
              max={28}
              value={current.steps}
              onChange={(value) => onChange("flux-2-flex", { steps: value })}
            />
            <RangeField
              label="Safety"
              min={1}
              max={5}
              value={current.safetyTolerance}
              onChange={(value) => onChange("flux-2-flex", { safetyTolerance: value })}
            />
            <ToggleField
              label="Upsample"
              checked={current.promptUpsampling}
              onChange={(checked) => onChange("flux-2-flex", { promptUpsampling: checked })}
            />
          </div>
        </div>
      );
    }
    case "flux-2-max": {
      const current = settings["flux-2-max"];

      return (
        <div className="rounded-[1rem] border border-[var(--border)] p-3">
          <p className="mb-3 text-sm font-medium">{model.name}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField
              label="MP"
              value={current.resolution}
              options={["0.5 MP", "1 MP", "2 MP"]}
              onChange={(value) =>
                onChange("flux-2-max", { resolution: value as "0.5 MP" | "1 MP" | "2 MP" })
              }
            />
            <SelectField
              label="Format"
              value={current.outputFormat}
              options={["webp", "jpg", "png"]}
              onChange={(value) =>
                onChange("flux-2-max", { outputFormat: value as "webp" | "jpg" | "png" })
              }
            />
            <RangeField
              label="Safety"
              min={1}
              max={5}
              value={current.safetyTolerance}
              onChange={(value) => onChange("flux-2-max", { safetyTolerance: value })}
            />
          </div>
        </div>
      );
    }
    case "gpt-image-1.5": {
      const current = settings["gpt-image-1.5"];

      return (
        <div className="rounded-[1rem] border border-[var(--border)] p-3">
          <p className="mb-3 text-sm font-medium">{model.name}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Quality"
              value={current.quality}
              options={["low", "medium", "high"]}
              onChange={(value) =>
                onChange("gpt-image-1.5", { quality: value as "low" | "medium" | "high" })
              }
            />
            <SelectField
              label="Format"
              value={current.outputFormat}
              options={["webp", "jpeg", "png"]}
              onChange={(value) =>
                onChange("gpt-image-1.5", { outputFormat: value as "webp" | "jpeg" | "png" })
              }
            />
            <SelectField
              label="Bg"
              value={current.background}
              options={["auto", "opaque", "transparent"]}
              onChange={(value) =>
                onChange("gpt-image-1.5", {
                  background: value as "auto" | "opaque" | "transparent",
                })
              }
            />
            <SelectField
              label="Moderation"
              value={current.moderation}
              options={["auto", "low"]}
              onChange={(value) =>
                onChange("gpt-image-1.5", { moderation: value as "auto" | "low" })
              }
            />
            <RangeField
              label="Compress"
              min={0}
              max={100}
              value={current.outputCompression}
              onChange={(value) => onChange("gpt-image-1.5", { outputCompression: value })}
            />
          </div>
        </div>
      );
    }
    case "nano-banana-pro": {
      const current = settings["nano-banana-pro"];

      return (
        <div className="rounded-[1rem] border border-[var(--border)] p-3">
          <p className="mb-3 text-sm font-medium">{model.name}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField
              label="Size"
              value={current.resolution}
              options={["1K", "2K", "4K"]}
              onChange={(value) =>
                onChange("nano-banana-pro", { resolution: value as "1K" | "2K" | "4K" })
              }
            />
            <SelectField
              label="Format"
              value={current.outputFormat}
              options={["jpg", "png"]}
              onChange={(value) =>
                onChange("nano-banana-pro", { outputFormat: value as "jpg" | "png" })
              }
            />
            <SelectField
              label="Safety"
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
    case "p-image": {
      const current = settings["p-image"];

      return (
        <div className="rounded-[1rem] border border-[var(--border)] p-3">
          <p className="mb-3 text-sm font-medium">{model.name}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleField
              label="Upsample"
              checked={current.promptUpsampling}
              onChange={(checked) => onChange("p-image", { promptUpsampling: checked })}
            />
            <ToggleField
              label="Safety"
              checked={!current.disableSafetyChecker}
              onChange={(checked) =>
                onChange("p-image", { disableSafetyChecker: !checked })
              }
            />
          </div>
        </div>
      );
    }
    case "z-image-turbo": {
      const current = settings["z-image-turbo"];

      return (
        <div className="rounded-[1rem] border border-[var(--border)] p-3">
          <p className="mb-3 text-sm font-medium">{model.name}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField
              label="Format"
              value={current.outputFormat}
              options={["jpg", "png", "webp"]}
              onChange={(value) =>
                onChange("z-image-turbo", { outputFormat: value as "jpg" | "png" | "webp" })
              }
            />
            <RangeField
              label="Steps"
              min={8}
              max={12}
              value={current.numInferenceSteps}
              onChange={(value) => onChange("z-image-turbo", { numInferenceSteps: value })}
            />
            <ToggleField
              label="Go fast"
              checked={current.goFast}
              onChange={(checked) => onChange("z-image-turbo", { goFast: checked })}
            />
          </div>
        </div>
      );
    }
  }
}

type SelectFieldProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">{label}</span>
      <select
        className="app-select rounded-xl px-3 py-2.5 text-sm"
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
      <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
        {label} {value}
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
    <button
      className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
        checked ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]"
      }`}
      type="button"
      onClick={() => onChange(!checked)}
    >
      <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">{label}</span>
      <p className="mt-1 font-medium">{checked ? "On" : "Off"}</p>
    </button>
  );
}

function buildFilename(prediction: PredictionSnapshot, outputIndex = 0) {
  const model = MODEL_LOOKUP[prediction.modelId];
  const url = prediction.outputUrls[outputIndex] ?? prediction.outputUrls[0] ?? "";
  const extension = url.split(".").pop()?.split("?")[0] || "png";
  const suffix = prediction.variantIndex ? `-${String(prediction.variantIndex).padStart(2, "0")}` : "";
  const slug = model.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${slug}${suffix}.${extension}`;
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
