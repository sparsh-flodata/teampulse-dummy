// Sign-in is FloData single sign-on, handled by the backend (/auth/login,
// /auth/callback, /auth/logout) with httpOnly cookies. The frontend only reads
// who is signed in, and links to sign-out and the FloData account page.
import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { Person } from "@/features/workspace/types";

export type Session = Person & {
  /** This tool's FloData roles, e.g. ["teampulse:editor"]. */
  roles: string[];
  mfa: boolean;
  /** FloData "My account": password, two-step verification, sessions. */
  account_url: string;
  logout_url: string;
};

export const sessionQuery = queryOptions({
  queryKey: ["auth", "me"] as const,
  queryFn: () => api.get<Session>("/auth/me"),
  staleTime: 5 * 60_000,
});
