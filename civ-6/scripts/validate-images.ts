import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { loadMarkdownEntries } from "./content-utils";

const root = process.cwd();
const archiveDirectory = path.join(root, "public", "images", "archive");
const manifestPath = path.join(archiveDirectory, "manifest.json");

function difference(left: Set<string>, right: Set<string>) {
  return [...left].filter((value) => !right.has(value)).sort();
}

function describe(values: string[]) {
  return values.length ? values.join(", ") : "없음";
}

function sha256(filePath: string) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function main() {
  const entries = loadMarkdownEntries();
  if (!entries.length) throw new Error("검증할 Markdown 항목이 없습니다.");
  if (!fs.existsSync(archiveDirectory)) throw new Error("public/images/archive 디렉터리가 없습니다.");
  if (!fs.existsSync(manifestPath)) throw new Error("이미지 manifest.json이 없습니다. npm run images:sync를 실행하세요.");

  const expectedSlugs = new Set(entries.map((entry) => entry.slug));
  const files = fs.readdirSync(archiveDirectory);
  const actualSlugs = new Set(
    files.filter((file) => file.endsWith(".webp")).map((file) => path.basename(file, ".webp")),
  );
  const temporaryFiles = files.filter((file) => file.startsWith(".") && file.includes(".next."));

  const parsedManifest: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!parsedManifest || typeof parsedManifest !== "object" || Array.isArray(parsedManifest)) {
    throw new Error("이미지 manifest.json 형식이 올바르지 않습니다.");
  }
  const manifest = parsedManifest as Record<string, unknown>;
  const manifestSlugs = new Set(Object.keys(manifest));
  const issues: string[] = [];

  const missingImages = difference(expectedSlugs, actualSlugs);
  const orphanImages = difference(actualSlugs, expectedSlugs);
  const missingManifest = difference(expectedSlugs, manifestSlugs);
  const orphanManifest = difference(manifestSlugs, expectedSlugs);
  if (missingImages.length) issues.push(`누락 WebP: ${describe(missingImages)}`);
  if (orphanImages.length) issues.push(`고아 WebP: ${describe(orphanImages)}`);
  if (missingManifest.length) issues.push(`누락 manifest 항목: ${describe(missingManifest)}`);
  if (orphanManifest.length) issues.push(`고아 manifest 항목: ${describe(orphanManifest)}`);
  if (temporaryFiles.length) issues.push(`남은 임시 파일: ${describe(temporaryFiles)}`);

  for (const entry of entries) {
    const value = manifest[entry.slug];
    const record = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
    if (!record || record.source !== entry.image) {
      issues.push(`${entry.slug}: manifest URL이 Markdown image와 다릅니다.`);
    }
    if (!record || typeof record.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(record.sha256)) {
      issues.push(`${entry.slug}: manifest SHA-256이 없거나 올바르지 않습니다.`);
    }

    const imagePath = path.join(archiveDirectory, `${entry.slug}.webp`);
    if (!fs.existsSync(imagePath)) continue;
    if (record && typeof record.sha256 === "string" && sha256(imagePath) !== record.sha256) {
      issues.push(`${entry.slug}: WebP 바이트가 manifest SHA-256과 다릅니다.`);
    }
    try {
      const metadata = await sharp(imagePath, { failOn: "error" }).metadata();
      if (metadata.format !== "webp") issues.push(`${entry.slug}: WebP 형식이 아닙니다.`);
      if (!metadata.width || !metadata.height) {
        issues.push(`${entry.slug}: 이미지 크기를 읽을 수 없습니다.`);
      } else if (metadata.width > 1600 || metadata.height > 1400) {
        issues.push(`${entry.slug}: 허용 크기 1600×1400을 초과합니다 (${metadata.width}×${metadata.height}).`);
      }
    } catch (error) {
      issues.push(`${entry.slug}: 이미지를 해석할 수 없습니다 (${String(error)}).`);
    }
  }

  if (issues.length) {
    throw new Error(`이미지 검증 실패:\n- ${issues.join("\n- ")}`);
  }
  console.log(`Validated ${entries.length} archive images and manifest entries.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
