// Session orchestration: sign-in, token refresh, account switching and
// sign-out. Every change of the active account clears the query cache so
// one account's data can never be shown under another.
import type { QueryClient } from "@tanstack/react-query";
import { configureApiClient } from "@/lib/api/client";
import * as authApi from "./api";
import {
  AUTH_STORAGE_KEY,
  addAccount,
  authStore,
  clearAccounts,
  getActiveAccount,
  readPersistedAccount,
  removeAccount,
  setActiveAccount,
  syncFromStorage,
  updateTokens,
} from "./store";

type Destination = { to: "/" } | { to: "/login"; expired?: string };
let queryClient: QueryClient | null = null;
let go: (destination: Destination) => void = () => {};

/** Connects the fetch client and cross-tab sync to the auth store. Client only. */
export function setupAuth(options: {
  queryClient: QueryClient;
  navigate: (destination: Destination) => void;
}) {
  queryClient = options.queryClient;
  go = options.navigate;
  configureApiClient({
    getAccessToken: () => {
      const account = getActiveAccount();
      if (!account) return null;
      tokenOwner.set(account.accessToken, String(account.userId));
      return account.accessToken;
    },
    refreshAccessToken,
    onAuthFailure: expireAccount,
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== AUTH_STORAGE_KEY) return;
    const { before, after } = syncFromStorage();
    if (before === after) return;
    queryClient?.clear();
    go(after ? { to: "/" } : { to: "/login" });
  });
}

// ------------------------------------------------------------ token refresh

const inflight = new Map<string, Promise<string | null>>();
/**
 * Which account each access token was sent for. A request can outlive an
 * account switch or a sign-out in another tab, so refresh and failure must
 * act on the token's owner, never on whichever account is active "now".
 */
const tokenOwner = new Map<string, string>();

/**
 * One refresh per account at a time: deduplicated within the tab, and
 * serialized across tabs with a Web Lock. Refresh tokens rotate, so two tabs
 * refreshing with the same token would get one of them signed out.
 */
function refreshAccessToken(failedToken: string): Promise<string | null> {
  const id = tokenOwner.get(failedToken);
  if (!id) return Promise.resolve(null);
  let pending = inflight.get(id);
  if (!pending) {
    pending = withLock("teampulse-refresh-" + id, (contended) =>
      renew(id, failedToken, contended),
    ).finally(() => inflight.delete(id));
    inflight.set(id, pending);
  }
  return pending;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function renew(id: string, failedToken: string, contended: boolean) {
  // Read the shared copy: another tab may have refreshed (or signed this
  // account out) while we waited for the lock. Chromium delivers another
  // tab's localStorage writes asynchronously, so after waiting on the lock
  // give that tab's new tokens a moment to arrive before refreshing with a
  // token it has just rotated.
  let latest = readPersistedAccount(id);
  for (let waited = 0; contended && waited < 1000; waited += 25) {
    if (!latest || latest.accessToken !== failedToken) break;
    await sleep(25);
    latest = readPersistedAccount(id);
  }
  if (!latest) return null;
  if (latest.accessToken !== failedToken) {
    updateTokens(id, latest);
    tokenOwner.set(latest.accessToken, id);
    return latest.accessToken;
  }
  try {
    const pair = await authApi.refresh(latest.refreshToken);
    updateTokens(id, {
      accessToken: pair.access_token,
      refreshToken: pair.refresh_token,
    });
    tokenOwner.set(pair.access_token, id);
    return pair.access_token;
  } catch {
    return null;
  }
}

/** Runs `task` under a cross-tab Web Lock; tells it whether it had to wait. */
async function withLock<T>(
  name: string,
  task: (contended: boolean) => Promise<T>,
): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) return task(false);
  const immediate = await navigator.locks.request(
    name,
    { ifAvailable: true },
    async (lock) => (lock ? { value: await task(false) } : null),
  );
  if (immediate) return immediate.value;
  return navigator.locks.request(name, () => task(true));
}

/**
 * Refresh failed for the account that sent `failedToken`: remove it and, if
 * it was this tab's active account, ask the user to sign in again. If another
 * tab already removed it, there is nothing to do here.
 */
function expireAccount(failedToken: string) {
  const id = tokenOwner.get(failedToken);
  const account = id ? readPersistedAccount(id) : undefined;
  if (!id || !account) return;
  const wasActive = authStore.get().activeAccountId === id;
  removeAccount(id);
  if (!wasActive) return;
  queryClient?.clear();
  go({ to: "/login", expired: account.email });
}

// ------------------------------------------------------------ account actions

export async function signIn(email: string, password: string) {
  return remember(await authApi.login(email, password));
}

/** Creates the account, then keeps it signed in like signIn does. */
export async function signUp(name: string, email: string, password: string) {
  return remember(await authApi.register(name, email, password));
}

function remember(result: Awaited<ReturnType<typeof authApi.login>>) {
  addAccount({
    userId: result.user.id,
    email: result.user.email,
    name: result.user.name,
    color: result.user.color,
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
  });
  queryClient?.clear();
  return result.user;
}

export function switchAccount(id: string) {
  if (authStore.get().activeAccountId === id) return;
  setActiveAccount(id);
  queryClient?.clear();
  go({ to: "/" });
}

/** Signs out one account (the active one by default), revoking its refresh token. */
export async function signOut(id = authStore.get().activeAccountId) {
  const account = id ? authStore.get().accounts[id] : null;
  if (!id || !account) return;
  // Revoke server-side first; sign out locally even if that fails.
  await authApi.logout(account.refreshToken).catch(() => undefined);
  const wasActive = authStore.get().activeAccountId === id;
  removeAccount(id);
  if (!wasActive) return;
  queryClient?.clear();
  go(getActiveAccount() ? { to: "/" } : { to: "/login" });
}

export async function signOutAll() {
  const accounts = Object.values(authStore.get().accounts);
  await Promise.allSettled(accounts.map((a) => authApi.logout(a.refreshToken)));
  clearAccounts();
  queryClient?.clear();
  go({ to: "/login" });
}
