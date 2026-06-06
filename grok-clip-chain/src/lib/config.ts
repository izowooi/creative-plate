import { homedir } from "node:os";
import { join } from "node:path";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function strFromEnv(name: string, fallback: string): string {
  return process.env[name] && process.env[name]!.trim() ? process.env[name]! : fallback;
}

export const config = {
  server: {
    host: strFromEnv("GROK_CHAIN_HOST", "127.0.0.1"),
    port: intFromEnv("GROK_CHAIN_PORT", 3456),
    bodyLimit: strFromEnv("GROK_CHAIN_BODY_LIMIT", "80mb"),
  },
  storage: {
    rootDir: strFromEnv("GROK_CHAIN_HOME", join(homedir(), ".grok-clip-chain")),
    get runsDir() {
      return join(this.rootDir, "runs");
    },
  },
  grok: {
    proxyHost: strFromEnv("GROK_CHAIN_PROXY_HOST", "127.0.0.1"),
    proxyPort: intFromEnv("GROK_CHAIN_PROXY_PORT", 18645),
    model: "grok-imagine-video",
    plannerModel: strFromEnv("GROK_CHAIN_PLANNER_MODEL", "grok-4.3"),
    startTimeoutMs: intFromEnv("GROK_CHAIN_VIDEO_START_TIMEOUT_MS", 60_000),
    pollIntervalMs: intFromEnv("GROK_CHAIN_VIDEO_POLL_INTERVAL_MS", 5_000),
    pollTimeoutMs: intFromEnv("GROK_CHAIN_VIDEO_TIMEOUT_MS", 900_000),
    downloadTimeoutMs: intFromEnv("GROK_CHAIN_VIDEO_DOWNLOAD_TIMEOUT_MS", 120_000),
    plannerTimeoutMs: intFromEnv("GROK_CHAIN_PLANNER_TIMEOUT_MS", 90_000),
  },
  chain: {
    defaultTargetLength: 60,
    minTargetLength: 20,
    maxTargetLength: 120,
    segmentDuration: 10,
    maxAttempts: 3,
    defaultResolution: "720p" as const,
    defaultAspectRatio: "16:9" as const,
  },
};

export type AppConfig = typeof config;
