import { z } from "zod";

export const MAX_UPLOAD_SECONDS = 60;
export const MAX_EDIT_SECONDS = 10;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_INPUT_BYTES = 50 * 1024 * 1024;

export type OutputQuality = "360p" | "480p" | "720p";

export type ValidationResult = { ok: true } | { ok: false; message: string };

export function validateUploadDuration(duration: number): ValidationResult {
  if (!Number.isFinite(duration) || duration <= 0) {
    return { ok: false, message: "영상 길이를 확인할 수 없습니다." };
  }
  if (duration >= MAX_UPLOAD_SECONDS) {
    return { ok: false, message: "영상은 1분 미만이어야 합니다." };
  }
  return { ok: true };
}

export function validateEditWindow(start: number, end: number, duration: number): ValidationResult {
  if (![start, end, duration].every(Number.isFinite) || start < 0 || end <= start || end > duration + 0.05) {
    return { ok: false, message: "편집 구간이 올바르지 않습니다." };
  }
  if (end - start > MAX_EDIT_SECONDS) {
    return { ok: false, message: "Omni 1.1 업로드 영상 편집은 최대 10초 구간을 지원합니다." };
  }
  return { ok: true };
}

export const qualitySchema = z.enum(["360p", "480p", "720p"]);

export function apiResolutionFor(quality: OutputQuality): "360p" | "720p" {
  const parsed = qualitySchema.safeParse(quality);
  if (!parsed.success) throw new Error("지원하지 않는 화질입니다. 최대 720p까지 선택할 수 있습니다.");
  return quality === "360p" ? "360p" : "720p";
}
