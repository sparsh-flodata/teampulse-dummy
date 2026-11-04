import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { ApiError } from "@/lib/api/client";
import { setupAuth } from "@/features/auth/session";
import { NotFound } from "@/features/workspace/components/NotFound";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Client errors (401/403/404/422) are final; retry only network/5xx.
        retry: (count, error) =>
          !(error instanceof ApiError && error.status < 500) && count < 2,
      },
    },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Smooth scrolling is for in-page scrolls; a new page starts at the top at once.
    scrollRestorationBehavior: "instant",
    defaultPreload: "intent",
    // Let TanStack Query own caching; loaders just ensure data exists.
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: NotFound,
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  if (typeof window !== "undefined")
    setupAuth({
      queryClient,
      navigate: (d) =>
        void (d.to === "/login"
          ? router.navigate({
              to: "/login",
              search: d.expired ? { expired: d.expired } : {},
            })
          : router.navigate({ to: "/" })),
    });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
  interface StaticDataRouteOption {
    /** Breadcrumb / heading label of a workspace page. */
    title?: import("@/features/workspace/navigation").View;
  }
}
