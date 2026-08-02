import type { Entry } from "./content";

const audioExtensionByMimeType: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/flac": "flac",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
};

export function archiveAudioPath(entry: Pick<Entry, "slug" | "greatWork">) {
  const audio = entry.greatWork?.audio;
  if (audio?.status !== "available") return null;
  const extension = audioExtensionByMimeType[audio.mimeType.toLowerCase()];
  return extension ? `/audio/archive/${entry.slug}.${extension}` : null;
}
