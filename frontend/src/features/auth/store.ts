import { createStore } from "@tanstack/react-store";
import type { Account, AuthState } from "./types";

/**
 * Signed-in accounts live in localStorage and are shared by every tab.
 *
 * Which account is *active*:
 * - production: shared in localStorage, so all tabs follow one account.
 * - development: per tab (sessionStorage), so one tab can act as a manager
 *   while another acts as an employee. New tabs start on the last-used account.
 */
export const PER_TAB_ACCOUNTS = import.meta.env.DEV;

const SHARED_KEY = "teampulse.auth";
const TAB_KEY = "teampulse.auth.tab";

type Persisted = {
  accounts: Record<string, Account>;
  activeAccountId: string | null;
  lastActiveAccountId: string | null;
};

const browser = typeof window !== "undefined";

function readShared(): Persisted {
  const empty: Persisted = {
    accounts: {},
    activeAccountId: null,
    lastActiveAccountId: null,
  };
  if (!browser) return empty;
  try {
    const parsed = JSON.parse(localStorage.getItem(SHARED_KEY) ?? "null");
    if (parsed && typeof parsed === "object" && parsed.accounts)
      return { ...empty, ...parsed };
  } catch {
    // Corrupt or blocked storage: start signed out.
  }
  return empty;
}

function readTabActive(): string | null {
  if (!browser) return null;
  try {
    return sessionStorage.getItem(TAB_KEY);
  } catch {
    return null;
  }
}

/** Picks the active account for this tab from persisted state. */
function resolveActive(shared: Persisted, current: string | null) {
  const exists = (id: string | null) => !!id && id in shared.accounts;
  if (!PER_TAB_ACCOUNTS)
    return exists(shared.activeAccountId) ? shared.activeAccountId : null;
  if (exists(current)) return current;
  if (exists(shared.lastActiveAccountId)) return shared.lastActiveAccountId;
  return Object.keys(shared.accounts)[0] ?? null;
}

const initial = readShared();
let lastActiveAccountId = initial.lastActiveAccountId;

export const authStore = createStore<AuthState>({
  accounts: initial.accounts,
  activeAccountId: resolveActive(initial, readTabActive()),
});

/** Persists a local change. Syncs from other tabs never write back (no echo loop). */
function persist(state: AuthState) {
  if (!browser) return;
  try {
    if (state.activeAccountId) lastActiveAccountId = state.activeAccountId;
    const shared: Persisted = {
      accounts: state.accounts,
      lastActiveAccountId,
      activeAccountId: PER_TAB_ACCOUNTS
        ? readShared().activeAccountId
        : state.activeAccountId,
    };
    localStorage.setItem(SHARED_KEY, JSON.stringify(shared));
    if (PER_TAB_ACCOUNTS) {
      if (state.activeAccountId)
        sessionStorage.setItem(TAB_KEY, state.activeAccountId);
      else sessionStorage.removeItem(TAB_KEY);
    }
  } catch {
    // Storage unavailable (private mode); the session lasts until reload.
  }
}

const storageWorks = (() => {
  if (!browser) return false;
  try {
    localStorage.setItem("teampulse.probe", "1");
    localStorage.removeItem("teampulse.probe");
    return true;
  } catch {
    return false;
  }
})();

/**
 * Applies a local change on top of the *latest persisted* state, then saves.
 * Read-modify-write is synchronous, so a tab never overwrites another tab's
 * newer change (a rotated token, a removed account) with its stale copy.
 */
function commit(updater: (s: AuthState) => AuthState) {
  let base = authStore.get();
  if (storageWorks) {
    const shared = readShared();
    lastActiveAccountId = shared.lastActiveAccountId ?? lastActiveAccountId;
    base = {
      accounts: shared.accounts,
      activeAccountId: resolveActive(shared, base.activeAccountId),
    };
  }
  authStore.setState(() => updater(base));
  persist(authStore.get());
}

/**
 * Applies changes made by other tabs (token refreshes, sign-ins, sign-outs).
 * Returns the previous and next active ids so the caller can react.
 */
export function syncFromStorage() {
  const before = authStore.get().activeAccountId;
  const shared = readShared();
  lastActiveAccountId = shared.lastActiveAccountId;
  const next = resolveActive(shared, before);
  authStore.setState(() => ({
    accounts: shared.accounts,
    activeAccountId: next,
  }));
  return { before, after: next };
}
export const AUTH_STORAGE_KEY = SHARED_KEY;

/** The freshest persisted copy of one account (another tab may have refreshed it). */
export const readPersistedAccount = (id: string): Account | undefined =>
  storageWorks ? readShared().accounts[id] : authStore.get().accounts[id];

export const getActiveAccount = (): Account | null => {
  const { activeAccountId, accounts } = authStore.get();
  return activeAccountId ? (accounts[activeAccountId] ?? null) : null;
};

export function addAccount(account: Account) {
  const id = String(account.userId);
  commit((s) => ({
    activeAccountId: id,
    accounts: { ...s.accounts, [id]: account },
  }));
}

export function setActiveAccount(id: string) {
  commit((s) => (id in s.accounts ? { ...s, activeAccountId: id } : s));
}

export function updateTokens(
  id: string,
  tokens: Pick<Account, "accessToken" | "refreshToken">,
) {
  commit((s) =>
    s.accounts[id]
      ? {
          ...s,
          accounts: { ...s.accounts, [id]: { ...s.accounts[id], ...tokens } },
        }
      : s,
  );
}

/** Removes one account. The tab falls back to another signed-in account, if any. */
export function removeAccount(id: string) {
  commit((s) => {
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

export function clearAccounts() {
  commit(() => ({ accounts: {}, activeAccountId: null }));
}
