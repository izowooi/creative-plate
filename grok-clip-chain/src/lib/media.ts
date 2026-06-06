import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { appError } from "./errors.js";

const execFileAsync = promisify(execFile);
const FFMPEG_TIMEOUT_MS = 120_000;

async function runFfmpeg(args: string[], timeoutMs = FFMPEG_TIMEOUT_MS): Promise<void> {
  try {
    await execFileAsync("ffmpeg", args, {
      timeout: timeoutMs,
      killSignal: process.platform === "win32" ? "SIGTERM" : "SIGKILL",
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error: any) {
    throw appError(`ffmpeg failed: ${error.stderr || error.message}`, 500, "FFMPEG_FAILED");
  }
}

export async function assertMediaTools(): Promise<void> {
  try {
    await execFileAsync("ffmpeg", ["-version"], { timeout: 5_000 });
    await execFileAsync("ffprobe", ["-version"], { timeout: 5_000 });
  } catch {
    throw appError("ffmpeg and ffprobe must be installed and available on PATH", 500, "MEDIA_TOOLS_MISSING");
  }
}

export async function probeDuration(file: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ], { timeout: 30_000 });
    const duration = Number(stdout.trim());
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("invalid duration");
    return duration;
  } catch (error: any) {
    throw appError(`ffprobe failed for ${basename(file)}: ${error.message}`, 500, "FFPROBE_FAILED");
  }
}

export async function writeMp4(file: string, buffer: Buffer): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, buffer);
}

export async function readMp4(file: string): Promise<Buffer> {
  return readFile(file);
}

export async function extractSeedWindow(input: string, output: string, seedSeconds: number): Promise<number> {
  const duration = await probeDuration(input);
  const actual = Math.min(seedSeconds, duration);
  const start = Math.max(0, duration - actual);
  await mkdir(dirname(output), { recursive: true });
  await runFfmpeg([
    "-y",
    "-ss",
    start.toFixed(3),
    "-i",
    input,
    "-t",
    actual.toFixed(3),
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    output,
  ]);
  return actual;
}

export async function extractExtensionTail(input: string, output: string, seedSeconds: number, maxTailSeconds: number): Promise<number> {
  const total = await probeDuration(input);
  const tail = Math.max(0.1, Math.min(maxTailSeconds, total - seedSeconds));
  await mkdir(dirname(output), { recursive: true });
  await runFfmpeg([
    "-y",
    "-ss",
    seedSeconds.toFixed(3),
    "-i",
    input,
    "-t",
    tail.toFixed(3),
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    output,
  ]);
  return tail;
}

function concatLine(file: string): string {
  return `file '${file.replace(/'/g, "'\\''")}'`;
}

export async function concatMp4(files: string[], output: string): Promise<void> {
  if (files.length === 0) throw appError("No clips to concatenate", 400, "CONCAT_EMPTY");
  await mkdir(dirname(output), { recursive: true });
  if (files.length === 1) {
    await runFfmpeg(["-y", "-i", files[0], "-c", "copy", output]);
    return;
  }
  const listFile = join(dirname(output), `concat-${Date.now()}.txt`);
  await writeFile(listFile, files.map(concatLine).join("\n"));
  try {
    await runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      output,
    ], 240_000);
  } finally {
    await unlink(listFile).catch(() => {});
  }
}

export async function makeSyntheticMp4(file: string, seconds: number, color = "blue"): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=160x90:d=${seconds}`,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    file,
  ]);
}
