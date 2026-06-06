import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "ui",
  plugins: [react()],
  build: {
    outDir: "../dist-ui",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:3456",
      "/runs": "http://127.0.0.1:3456",
    },
  },
});
