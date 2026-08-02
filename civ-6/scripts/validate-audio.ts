import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { loadMarkdownEntries } from "./content-utils";

const root = process.cwd();
const archiveDirectory = path.join(root, "public", "audio", "archive");
const manifestPath = path.join(archiveDirectory, "manifest.json");
const extensionByMimeType: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/flac": "flac",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
};

function difference(left: Set<string>, right: Set<string>) {
  return [...left].filter((value) => !right.has(value)).sort();
}

function describe(values: string[]) {
  return values.length ? values.join(", ") : "없음";
}

function sha256(filePath: string) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function hasExpectedSignature(filePath: string, mimeType: string) {
  const bytes = fs.readFileSync(filePath).subarray(0, 16);
  if (mimeType === "audio/ogg") return bytes.subarray(0, 4).toString("ascii") === "OggS";
  if (mimeType === "audio/flac") return bytes.subarray(0, 4).toString("ascii") === "fLaC";
  if (mimeType === "audio/wav") {
    return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WAVE";
  }
  if (mimeType === "audio/mp4") return bytes.subarray(4, 8).toString("ascii") === "ftyp";
  if (mimeType === "audio/mpeg") {
    return bytes.subarray(0, 3).toString("ascii") === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  }
  return false;
}

function main() {
  const entries = loadMarkdownEntries();
  const audioEntries = entries.flatMap((entry) => {
    const audio = entry.greatWork?.audio;
    return audio?.status === "available" ? [{ entry, audio }] : [];
  });
  if (!fs.existsSync(archiveDirectory)) throw new Error("public/audio/archive 디렉터리가 없습니다.");
  if (!fs.existsSync(manifestPath)) throw new Error("audio manifest.json이 없습니다. npm run audio:sync를 실행하세요.");

  const expectedFiles = new Map(audioEntries.map(({ entry, audio }) => {
    const extension = extensionByMimeType[audio.mimeType.toLowerCase()];
    if (!extension) throw new Error(`${entry.slug}: 지원하지 않는 audio MIME type ${audio.mimeType}`);
    return [entry.slug, `${entry.slug}.${extension}`];
  }));
  const expectedSlugs = new Set(expectedFiles.keys());
  const files = fs.readdirSync(archiveDirectory);
  const actualMediaFiles = files.filter((file) => file !== "manifest.json" && !file.startsWith("."));
  const actualFiles = new Set(actualMediaFiles);
  const expectedMediaFiles = new Set(expectedFiles.values());
  const temporaryFiles = files.filter((file) => file.startsWith(".") && file.includes(".next"));

  const parsedManifest: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!parsedManifest || typeof parsedManifest !== "object" || Array.isArray(parsedManifest)) {
    throw new Error("audio manifest.json 형식이 올바르지 않습니다.");
  }
  const manifest = parsedManifest as Record<string, unknown>;
  const manifestSlugs = new Set(Object.keys(manifest));
  const issues: string[] = [];

  const missingFiles = difference(expectedMediaFiles, actualFiles);
  const orphanFiles = difference(actualFiles, expectedMediaFiles);
  const missingManifest = difference(expectedSlugs, manifestSlugs);
  const orphanManifest = difference(manifestSlugs, expectedSlugs);
  if (missingFiles.length) issues.push(`누락 audio: ${describe(missingFiles)}`);
  if (orphanFiles.length) issues.push(`고아 audio: ${describe(orphanFiles)}`);
  if (missingManifest.length) issues.push(`누락 manifest 항목: ${describe(missingManifest)}`);
  if (orphanManifest.length) issues.push(`고아 manifest 항목: ${describe(orphanManifest)}`);
  if (temporaryFiles.length) issues.push(`남은 임시 파일: ${describe(temporaryFiles)}`);

  for (const { entry, audio } of audioEntries) {
    const value = manifest[entry.slug];
    const record = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
    const expectedFile = expectedFiles.get(entry.slug);
    if (
      !record ||
      record.source !== audio.sourceFile ||
      record.sourcePage !== audio.sourcePage ||
      record.mimeType !== audio.mimeType ||
      record.file !== expectedFile
    ) {
      issues.push(`${entry.slug}: manifest metadata가 Markdown audio와 다릅니다.`);
    }
    if (!record || typeof record.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(record.sha256)) {
      issues.push(`${entry.slug}: manifest SHA-256이 없거나 올바르지 않습니다.`);
    }

    if (!expectedFile) continue;
    const audioPath = path.join(archiveDirectory, expectedFile);
    if (!fs.existsSync(audioPath)) continue;
    if (!fs.statSync(audioPath).size) issues.push(`${entry.slug}: audio 파일이 비어 있습니다.`);
    if (record && typeof record.sha256 === "string" && sha256(audioPath) !== record.sha256) {
      issues.push(`${entry.slug}: audio 바이트가 manifest SHA-256과 다릅니다.`);
    }
    if (!hasExpectedSignature(audioPath, audio.mimeType)) {
      issues.push(`${entry.slug}: ${audio.mimeType} 파일 서명이 올바르지 않습니다.`);
    }
  }

  if (issues.length) throw new Error(`audio 검증 실패:\n- ${issues.join("\n- ")}`);
  console.log(`Validated ${audioEntries.length} archive recordings for ${entries.length} content entries.`);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
