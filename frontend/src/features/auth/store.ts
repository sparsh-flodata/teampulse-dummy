import { createStore } from "@tanstack/react-store";
import type { Account, AuthState } from "./types";

const STORAGE_KEY = "teampulse.auth";

function read(): AuthState {
  const empty: AuthState = { activeAccountId: null, accounts: {} };
  if (typeof window === "undefined") return empty;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (parsed && typeof parsed === "object" && parsed.accounts)
      return {
        activeAccountId: parsed.activeAccountId ?? null,
        accounts: parsed.accounts,
      };
  } catch {
    // Corrupt or blocked storage: start signed out.
  }
  return empty;
}

export const authStore = createStore<AuthState>(read());

authStore.subscribe((state) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode); the session lasts until reload.
  }
});

export const getActiveAccount = (): Account | null => {
  const { activeAccountId, accounts } = authStore.get();
  return activeAccountId ? (accounts[activeAccountId] ?? null) : null;
};

export function addAccount(account: Account) {
  const id = String(account.userId);
  authStore.setState((s) => ({
    activeAccountId: id,
    accounts: { ...s.accounts, [id]: account },
  }));
}

export function removeAccount(id: string) {
  authStore.setState((s) => {
    const accounts = { ...s.accounts };
    delete accounts[id];
    return {
      accounts,
      activeAccountId:
        s.activeAccountId === id
          ? (Object.keys(accounts)[0] ?? null)
          : s.activeAccountId,
    };
  });
}
