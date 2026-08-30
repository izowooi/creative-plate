import { NextResponse } from "next/server";
import { compressReferenceImage, readVideoDuration } from "@/lib/server-media";
import { configuredApiKeys, runWithApiKeyFallback } from "@/lib/api-keys";
import { editWithOmni } from "@/lib/omni";
import {
  MAX_IMAGE_INPUT_BYTES,
  MAX_VIDEO_BYTES,
  qualitySchema,
  validateEditWindow,
  validateUploadDuration,
} from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

function responseError(message: string, status = 400, reason?: string) {
  return NextResponse.json({ ok: false, error: message, reason }, { status });
}

export async function POST(request: Request) {
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return responseError("multipart/form-data 형식으로 미디어를 전송해 주세요.");
    }
    const video = form.get("video");
    const image = form.get("image");
    const quality = qualitySchema.safeParse(form.get("quality") ?? "480p");
    const prompt = String(form.get("prompt") ?? "").slice(0, 1200);
    const start = Number(form.get("start") ?? 0);
    const end = Number(form.get("end") ?? 10);

    if (!(video instanceof File) || !(image instanceof File)) return responseError("영상과 캐릭터 이미지를 모두 업로드해 주세요.");
    if (!video.type.startsWith("video/")) return responseError("지원하는 영상 파일이 아닙니다.");
    if (!image.type.startsWith("image/")) return responseError("지원하는 이미지 파일이 아닙니다.");
    if (video.size > MAX_VIDEO_BYTES) return responseError("영상 파일은 100MB 이하여야 합니다.");
    if (image.size > MAX_IMAGE_INPUT_BYTES) return responseError("이미지 원본은 50MB 이하여야 합니다.");
    if (!quality.success) return responseError("화질은 360p, 480p, 720p 중에서 선택해 주세요.");

    const duration = await readVideoDuration(video);
    const uploadCheck = validateUploadDuration(duration);
    if (!uploadCheck.ok) return responseError(uploadCheck.message);
    const editCheck = validateEditWindow(start, end, duration);
    if (!editCheck.ok) return responseError(editCheck.message);

    // Omni currently accepts a maximum ten-second uploaded edit input. The UI
    // only sends the original file when the selected range covers that file.
    if (start > 0.01 || end < duration - 0.05) {
      return responseError("선택 구간 내보내기가 완료되지 않았습니다. 10초 이하 원본을 사용해 주세요.");
    }

    const imageJpeg = await compressReferenceImage(image);
    const result = await runWithApiKeyFallback(configuredApiKeys(), (apiKey) =>
      editWithOmni({ apiKey, video, imageJpeg, prompt, quality: quality.data }),
    );
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const details = error as { message?: string; status?: number; reason?: string };
    const status = details.status && details.status >= 400 && details.status < 600 ? details.status : 500;
    return responseError(details.message ?? "영상 생성 중 오류가 발생했습니다.", status, details.reason);
  }
}
