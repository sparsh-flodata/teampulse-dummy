import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { WorkspaceState } from "./types";

/** The workspace snapshot. Polled every 15s, only while the tab is visible. */
export const stateQuery = queryOptions({
  queryKey: queryKeys.state,
  queryFn: () => api.get<WorkspaceState>("/state"),
  refetchInterval: 15_000,
  refetchIntervalInBackground: false,
});

export const markNotificationRead = (id: number) =>
  api.post("/notifications/" + id + "/read");
