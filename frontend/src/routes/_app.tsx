import { createFileRoute, useRouter } from "@tanstack/react-router";
import { stateQuery } from "@/features/workspace/api";
import { AppShell } from "@/features/workspace/components/AppShell";
import { BootError, BootScreen } from "@/features/workspace/components/Boot";
import { workspaceSearchSchema } from "@/features/workspace/navigation";

/**
 * Every signed-in page: workspace snapshot and the app shell. Signed out, the
 * snapshot request answers 401 and the API client sends the browser to the
 * FloData sign-in, which returns here.
 */
export const Route = createFileRoute("/_app")({
  validateSearch: workspaceSearchSchema,
  ssr: false,
  loader: ({ context }) => context.queryClient.ensureQueryData(stateQuery),
  pendingComponent: BootScreen,
  errorComponent: function AppError({ error, reset }) {
    const router = useRouter();
    return (
      <BootError
        message={
          error instanceof Error
            ? error.message
            : "The server could not complete this request."
        }
        onRetry={() => {
          reset();
          void router.invalidate();
        }}
      />
    );
  },
  component: AppShell,
});
