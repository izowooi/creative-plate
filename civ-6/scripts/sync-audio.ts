import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { loadMarkdownEntries } from "./content-utils";

const outputDirectory = path.join(process.cwd(), "public", "audio", "archive");
const manifestPath = path.join(outputDirectory, "manifest.json");
const entries = loadMarkdownEntries();
const audioEntries = entries.flatMap((entry) => {
  const audio = entry.greatWork?.audio;
  return audio?.status === "available" ? [{ entry, audio }] : [];
});
const forceAll = process.argv.includes("--force");
const forcedSlugs = new Set(
  process.argv
    .filter((argument) => argument.startsWith("--force="))
    .map((argument) => argument.slice("--force=".length))
    .filter(Boolean),
);
const knownSlugs = new Set(entries.map((entry) => entry.slug));
const audioSlugs = new Set(audioEntries.map(({ entry }) => entry.slug));
const unknownForcedSlugs = [...forcedSlugs].filter((slug) => !knownSlugs.has(slug));
if (unknownForcedSlugs.length) {
  throw new Error(`알 수 없는 강제 동기화 slug: ${unknownForcedSlugs.join(", ")}`);
}
const forcedWithoutAudio = [...forcedSlugs].filter((slug) => !audioSlugs.has(slug));
if (forcedWithoutAudio.length) {
  throw new Error(`공개 녹음이 없는 항목은 강제 동기화할 수 없습니다: ${forcedWithoutAudio.join(", ")}`);
}

const extensionByMimeType: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/flac": "flac",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
};

type ManifestRecord = {
  source: string;
  sourcePage: string;
  sha256: string;
  mimeType: string;
  file: string;
};

fs.mkdirSync(outputDirectory, { recursive: true });
const hadManifest = fs.existsSync(manifestPath);
const previousManifest = hadManifest
  ? (JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>)
  : {};
const nextManifest: Record<string, ManifestRecord> = {};

function sha256(filePath: string) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function extensionFor(mimeType: string) {
  const extension = extensionByMimeType[mimeType.toLowerCase()];
  if (!extension) throw new Error(`지원하지 않는 audio MIME type: ${mimeType}`);
  return extension;
}

function previousRecord(slug: string) {
  const value = previousManifest[slug];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.source !== "string" ||
    typeof record.sourcePage !== "string" ||
    typeof record.sha256 !== "string" ||
    typeof record.mimeType !== "string" ||
    typeof record.file !== "string"
  ) return null;
  return record as ManifestRecord;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(header: string | null, fallback: number) {
  if (!header) return fallback;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(fallback, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? fallback : Math.max(fallback, date - Date.now());
}

async function fetchWithRetry(url: string) {
  const requested = new URL(url);
  if (requested.protocol !== "https:" || requested.hostname !== "upload.wikimedia.org") {
    throw new Error("HTTPS upload.wikimedia.org audio만 동기화할 수 있습니다.");
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(60_000),
        headers: {
          "User-Agent": "TheTurnHistoryArchive/0.1 (https://github.com/izowooi/creative-plate)",
          Accept: "audio/ogg,audio/mpeg,audio/flac,audio/wav,audio/mp4,audio/*;q=0.8",
        },
      });
    } catch (error) {
      if (attempt === 2) throw error;
      await wait([2_000, 5_000][attempt]);
      continue;
    }
    const finalUrl = new URL(response.url);
    if (finalUrl.protocol !== "https:" || finalUrl.hostname !== "upload.wikimedia.org") {
      await response.body?.cancel();
      throw new Error(`허용되지 않은 redirect 대상: ${finalUrl.hostname}`);
    }
    if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === 2) return response;

    await response.body?.cancel();
    await wait(Math.min(8_000, retryDelay(response.headers.get("retry-after"), [2_000, 5_000][attempt])));
  }
  throw new Error("unreachable");
}

function compatibleMimeType(declared: string, received: string) {
  if (declared === received) return true;
  return declared === "audio/ogg" && received === "application/ogg";
}

async function syncAudio({ entry, audio }: (typeof audioEntries)[number]) {
  const extension = extensionFor(audio.mimeType);
  const file = `${entry.slug}.${extension}`;
  const outputPath = path.join(outputDirectory, file);
  const previous = previousRecord(entry.slug);
  if (
    !forceAll &&
    !forcedSlugs.has(entry.slug) &&
    hadManifest &&
    fs.existsSync(outputPath) &&
    previous?.source === audio.sourceFile &&
    previous.sourcePage === audio.sourcePage &&
    previous.mimeType === audio.mimeType &&
    previous.file === file &&
    sha256(outputPath) === previous.sha256
  ) {
    nextManifest[entry.slug] = previous;
    return { status: "kept", slug: entry.slug } as const;
  }

  const response = await fetchWithRetry(audio.sourceFile);
  if (!response.ok) throw new Error(`${entry.slug}: audio 응답 ${response.status}`);
  const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() ?? "";
  if (!compatibleMimeType(audio.mimeType, contentType)) {
    throw new Error(`${entry.slug}: 선언 MIME ${audio.mimeType}과 응답 MIME ${contentType || "unknown"}이 다릅니다.`);
  }

  const maximumBytes = 50 * 1024 * 1024;
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > maximumBytes) throw new Error(`${entry.slug}: audio가 50MB를 초과합니다.`);
  if (!response.body) throw new Error(`${entry.slug}: 빈 audio 응답입니다.`);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maximumBytes) {
      await reader.cancel();
      throw new Error(`${entry.slug}: audio가 50MB를 초과합니다.`);
    }
    chunks.push(Buffer.from(value));
  }
  if (!byteLength) throw new Error(`${entry.slug}: audio 바이트가 비어 있습니다.`);

  const temporaryPath = path.join(outputDirectory, `.${file}.next`);
  try {
    fs.writeFileSync(temporaryPath, Buffer.concat(chunks, byteLength));
    fs.renameSync(temporaryPath, outputPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
  }

  nextManifest[entry.slug] = {
    source: audio.sourceFile,
    sourcePage: audio.sourcePage,
    sha256: sha256(outputPath),
    mimeType: audio.mimeType,
    file,
  };
  return { status: "downloaded", slug: entry.slug } as const;
}

async function main() {
  const results = [];
  const failures: string[] = [];
  for (const [index, item] of audioEntries.entries()) {
    try {
      const result = await syncAudio(item);
      results.push(result);
      console.log(`[${index + 1}/${audioEntries.length}] ${result.status}: ${result.slug}`);
      if (result.status === "downloaded") await wait(1_500);
    } catch (error) {
      failures.push(item.entry.slug);
      console.error(`[${index + 1}/${audioEntries.length}] failed: ${item.entry.slug} — ${String(error)}`);
    }
  }

  const downloaded = results.filter((result) => result.status === "downloaded").length;
  console.log(
    `Synced ${results.length}/${audioEntries.length} archive recordings ` +
    `(${downloaded} downloaded, ${results.length - downloaded} kept).`,
  );

  const temporaryManifestPath = path.join(outputDirectory, ".manifest.next.json");
  try {
    fs.writeFileSync(temporaryManifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
    fs.renameSync(temporaryManifestPath, manifestPath);
  } finally {
    if (fs.existsSync(temporaryManifestPath)) fs.rmSync(temporaryManifestPath);
  }

  if (failures.length) throw new Error(`동기화 실패: ${failures.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
