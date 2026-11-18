import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { msw } from "msw/vite";

export default defineConfig(({ command, mode }) => ({
  resolve: { tsconfigPaths: true },
  // Real backend (FastAPI, 8787 by default; override with API_PROXY_TARGET in
  // frontend/.env.development.local). /auth is FloData sign-in: proxied so the
  // httpOnly session cookies belong to this origin (FLODATA_APP_URL). Open the
  // app at http://localhost:5173, the address registered in FloData Auth.
  server: {
    proxy: Object.fromEntries(
      ["/api", "/auth"].map((path) => [
        path,
        loadEnv(mode, process.cwd(), "API_").API_PROXY_TARGET ||
          "http://127.0.0.1:8787",
      ]),
    ),
  },
  plugins: [
    // SPA mode: the build emits a static shell at dist/client/index.html that
    // FastAPI serves for every non-API path. No server rendering at runtime.
    tanstackStart({
      spa: { enabled: true, prerender: { outputPath: "/index" } },
    }),
    viteReact(),
    // Dev server only: serves /mockServiceWorker.js. Builds never ship it.
    command === "serve" && msw({ mode: "worker-only" }),
  ],
}));
