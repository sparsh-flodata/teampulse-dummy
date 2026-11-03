import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // Real backend (FastAPI on 8787). Ignored while MSW mocks are enabled.
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  plugins: [
    // SPA mode: the build emits a static shell at dist/client/index.html that
    // FastAPI serves for every non-API path. No server rendering at runtime.
    tanstackStart({
      spa: { enabled: true, prerender: { outputPath: "/index" } },
    }),
    viteReact(),
  ],
});
