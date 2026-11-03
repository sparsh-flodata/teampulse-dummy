import { useCallback, useSyncExternalStore } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { showToast } from "@/lib/ui-store";
import { stateQuery } from "./api";

/** The current workspace snapshot. Only used under the _app layout, whose loader guarantees data. */
export function useWorkspace() {
  return useSuspenseQuery(stateQuery).data;
}

/**
 * Runs a write, then refreshes everything (as the old app's `refresh()` did)
 * and shows the success toast. Errors stay on the mutation for inline display.
 */
export function useWorkspaceMutation<TVars, TResult = unknown>(
  mutationFn: (vars: TVars) => Promise<TResult>,
  successMessage?: string | ((result: TResult, vars: TVars) => string),
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (result, vars) => {
      await queryClient.invalidateQueries();
      const message =
        typeof successMessage === "function"
          ? successMessage(result, vars)
          : successMessage;
      if (message) showToast(message);
    },
  });
}

export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Current time, refreshed every minute, for relative labels such as "5m ago". */
export function useNow() {
  return useSyncExternalStore(subscribeMinute, getMinute, getMinute);
}
let minute = Date.now();
function getMinute() {
  return minute;
}
function subscribeMinute(onChange: () => void) {
  const timer = setInterval(() => {
    minute = Date.now();
    onChange();
  }, 60_000);
  return () => clearInterval(timer);
}
