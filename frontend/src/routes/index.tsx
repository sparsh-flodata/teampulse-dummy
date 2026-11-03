import { createFileRoute } from "@tanstack/react-router";
import LegacyApp from "@/legacy/app/App";

// Phase 1 only: renders the untouched legacy UI on the new toolchain and
// tokenized styles. Replaced by the real route tree in Phase 2.
export const Route = createFileRoute("/")({
  ssr: false,
  component: LegacyApp,
});
