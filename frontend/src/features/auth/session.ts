import type { QueryClient } from "@tanstack/react-query";
import { configureApiClient } from "@/lib/api/client";
import * as authApi from "./api";
import { addAccount, getActiveAccount, removeAccount } from "./store";

type Navigate = (to: "/login" | "/") => void;
let queryClient: QueryClient | null = null;
let navigate: Navigate = () => {};

/** Connects the fetch client to the auth store. Called once on the client. */
export function setupAuth(options: {
  queryClient: QueryClient;
  navigate: Navigate;
}) {
  queryClient = options.queryClient;
  navigate = options.navigate;
  configureApiClient({
    getAccessToken: () => getActiveAccount()?.accessToken ?? null,
    // Phase 3 adds refresh-and-retry; for now an expired session signs out.
    onUnauthorized: () => {
      const account = getActiveAccount();
      if (account) removeAccount(String(account.userId));
      queryClient?.clear();
      navigate("/login");
    },
  });
}

export async function signIn(email: string, password: string) {
  const result = await authApi.login(email, password);
  addAccount({
    userId: result.user.id,
    email: result.user.email,
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
  });
  queryClient?.clear();
  return result.user;
}

export async function signOut() {
  const account = getActiveAccount();
  if (!account) return;
  // Revoke server-side first; sign out locally even if that fails.
  await authApi.logout(account.refreshToken).catch(() => undefined);
  removeAccount(String(account.userId));
  queryClient?.clear();
  navigate(getActiveAccount() ? "/" : "/login");
}
