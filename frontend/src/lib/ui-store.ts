import { createStore } from "@tanstack/react-store";

/** Transient UI state shared across the shell (not persisted). */
export const uiStore = createStore({ toast: "", toastId: 0 });

export function showToast(message: string) {
  if (!message) return;
  uiStore.setState((s) => ({ toast: message, toastId: s.toastId + 1 }));
}

export function dismissToast() {
  uiStore.setState((s) => ({ ...s, toast: "" }));
}
