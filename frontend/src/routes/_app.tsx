import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { getActiveAccount } from "@/features/auth/store";
import { stateQuery } from "@/features/workspace/api";
import { AppShell } from "@/features/workspace/components/AppShell";
import { BootError, BootScreen } from "@/features/workspace/components/Boot";
import { workspaceSearchSchema } from "@/features/workspace/navigation";

/** Every signed-in page: auth guard, workspace snapshot, and the app shell. */
export const Route = createFileRoute("/_app")({
  validateSearch: workspaceSearchSchema,
  ssr: false,
  beforeLoad: () => {
    // UX guard only; the API rejects requests without a valid token.
    if (!getActiveAccount()) throw redirect({ to: "/login" });
  },
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
