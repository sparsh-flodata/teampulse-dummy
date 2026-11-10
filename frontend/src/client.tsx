import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

// Mock API (MSW) in development. Swap to the real backend by setting
// VITE_API_MOCKS=false in .env.development; production builds never mock.
async function enableMocks() {
  if (!import.meta.env.DEV || import.meta.env.VITE_API_MOCKS !== "true") return;
  const { startMocks } = await import("./mocks/browser");
  await startMocks();
}

void enableMocks().then(() =>
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    );
  }),
);
