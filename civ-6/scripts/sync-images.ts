import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { loadMarkdownEntries } from "./content-utils";

const outputDirectory = path.join(process.cwd(), "public", "images", "archive");
const manifestPath = path.join(outputDirectory, "manifest.json");
const entries = loadMarkdownEntries();
const forceAll = process.argv.includes("--force");
const forcedSlugs = new Set(
  process.argv
    .filter((argument) => argument.startsWith("--force="))
    .map((argument) => argument.slice("--force=".length))
    .filter(Boolean),
);
const knownSlugs = new Set(entries.map((entry) => entry.slug));
const unknownForcedSlugs = [...forcedSlugs].filter((slug) => !knownSlugs.has(slug));
if (unknownForcedSlugs.length) {
  throw new Error(`알 수 없는 강제 동기화 slug: ${unknownForcedSlugs.join(", ")}`);
}

fs.mkdirSync(outputDirectory, { recursive: true });
const hadManifest = fs.existsSync(manifestPath);
const previousManifest = hadManifest
  ? (JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>)
  : {};
const nextManifest: Record<string, { source: string; sha256: string }> = {};

function sha256(filePath: string) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function previousRecord(slug: string) {
  const value = previousManifest[slug];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return typeof record.source === "string" && typeof record.sha256 === "string"
    ? { source: record.source, sha256: record.sha256 }
    : null;
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
    throw new Error("HTTPS upload.wikimedia.org 이미지만 동기화할 수 있습니다.");
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "User-Agent": "TheTurnHistoryArchive/0.1 (https://github.com/izowooi/creative-plate)",
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/svg+xml,image/*;q=0.8",
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

async function syncImage(entry: (typeof entries)[number]) {
  if (!entry.image) throw new Error(`${entry.slug}: image URL이 없습니다.`);
  const outputPath = path.join(outputDirectory, `${entry.slug}.webp`);
  const previous = previousRecord(entry.slug);
  if (!forceAll && !forcedSlugs.has(entry.slug) && hadManifest && fs.existsSync(outputPath) && previous?.source === entry.image) {
    const metadata = await sharp(outputPath).metadata();
    const digest = sha256(outputPath);
    if (metadata.width && metadata.height && metadata.format === "webp" && digest === previous.sha256) {
      nextManifest[entry.slug] = { source: entry.image, sha256: digest };
      return { status: "kept", slug: entry.slug };
    }
  }

  const response = await fetchWithRetry(entry.image);
  if (!response.ok) throw new Error(`${entry.slug}: 이미지 응답 ${response.status}`);

  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`${entry.slug}: image가 아닌 MIME ${contentType || "unknown"}`);
  }

  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > 30 * 1024 * 1024) throw new Error(`${entry.slug}: 이미지가 30MB를 초과합니다.`);

  if (!response.body) throw new Error(`${entry.slug}: 빈 이미지 응답입니다.`);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > 30 * 1024 * 1024) {
      await reader.cancel();
      throw new Error(`${entry.slug}: 이미지가 30MB를 초과합니다.`);
    }
    chunks.push(Buffer.from(value));
  }
  const bytes = Buffer.concat(chunks, byteLength);

  const temporaryPath = path.join(outputDirectory, `.${entry.slug}.next.webp`);
  try {
    await sharp(bytes, { failOn: "error", density: 300 })
      .rotate()
      .resize({ width: 1600, height: 1400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4, smartSubsample: true })
      .toFile(temporaryPath);
    fs.renameSync(temporaryPath, outputPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
  }
  nextManifest[entry.slug] = { source: entry.image, sha256: sha256(outputPath) };
  return { status: "downloaded", slug: entry.slug };
}

async function main() {
  const results = [];
  const failures: string[] = [];
  for (const [index, entry] of entries.entries()) {
    try {
      const result = await syncImage(entry);
      results.push(result);
      console.log(`[${index + 1}/${entries.length}] ${result.status}: ${entry.slug}`);
      if (result.status === "downloaded") await wait(1_500);
    } catch (error) {
      failures.push(entry.slug);
      console.error(`[${index + 1}/${entries.length}] failed: ${entry.slug} — ${String(error)}`);
    }
  }

  const downloaded = results.filter((result) => result.status === "downloaded").length;
  console.log(`Synced ${results.length}/${entries.length} archive images (${downloaded} downloaded, ${results.length - downloaded} kept).`);

  const temporaryManifestPath = path.join(outputDirectory, ".manifest.next.json");
  try {
    fs.writeFileSync(temporaryManifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
    fs.renameSync(temporaryManifestPath, manifestPath);
  } finally {
    if (fs.existsSync(temporaryManifestPath)) fs.rmSync(temporaryManifestPath);
  }

  // 성공한 항목은 실패가 섞인 실행에서도 기록해 다음 재시도가 해당 파일을 다시 받지 않게 한다.
  // 누락된 실패 항목은 images:check가 계속 명확히 보고한다.
  if (failures.length) throw new Error(`동기화 실패: ${failures.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
