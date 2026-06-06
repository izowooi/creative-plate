import type { AppConfig } from "./config.js";

export function getGrokProxyBaseUrl(cfg: AppConfig): string {
  return `http://${cfg.grok.proxyHost}:${cfg.grok.proxyPort}`;
}

export function getGrokProxyUrl(cfg: AppConfig, path = "/v1"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getGrokProxyBaseUrl(cfg)}${normalized}`;
}
