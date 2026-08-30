export async function getVideoDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error("영상 메타데이터를 읽을 수 없습니다."));
      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function trimVideo(file: File, start: number, end: number): Promise<File> {
  if (start <= 0.01 && end >= (await getVideoDuration(file)) - 0.05) return file;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = false;
  video.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("선택 구간을 준비하지 못했습니다."));
  });
  video.currentTime = start;
  await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });

  const capture = video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
  const stream = capture.captureStream?.() ?? capture.mozCaptureStream?.();
  if (!stream || typeof MediaRecorder === "undefined") {
    URL.revokeObjectURL(url);
    throw new Error("이 브라우저는 구간 추출을 지원하지 않습니다. Chrome 최신 버전을 사용해 주세요.");
  }
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : "video/webm";
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  recorder.start(250);
  await video.play();
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (video.currentTime >= end || video.ended) return resolve();
      requestAnimationFrame(tick);
    };
    tick();
  });
  video.pause();
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());
  URL.revokeObjectURL(url);
  return new File(chunks, "scene-selection.webm", { type: "video/webm" });
}

export async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("이미지를 압축하지 못했습니다.")), "image/jpeg", 0.84),
  );
  return new File([blob], "character-reference.jpg", { type: "image/jpeg" });
}

export function downloadDataVideo(data: string, mimeType: string, filename: string) {
  const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
