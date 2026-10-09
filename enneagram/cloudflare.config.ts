import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./worker/index.js" with { type: "cf-worker" };

export default defineConfig({
  accountId: "ad6fadce86c3f6dc91626ae088baaa84",
  worker: {
    name: "enneagram-atlas",
    compatibilityDate: "2026-10-09",
    entrypoint,
    domains: ["eg.zowoo.uk"],
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/api/*"],
    },
    env: {
      ASSETS: { type: "assets" },
      SUPABASE_URL: bindings.text("https://elufbvcnhitoksoofbir.supabase.co"),
      SUPABASE_ANON_KEY: bindings.secret(),
      API_LIMITER: bindings.rateLimit({
        namespace: "1001",
        simple: { limit: 90, period: 60 },
      }),
    },
  },
});
