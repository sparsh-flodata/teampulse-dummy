// Sign-in contract (real backend): FloData single sign-on.
//   GET /auth/login?next=/path  -> FloData sign-in, back to /auth/callback, httpOnly cookies, then /path
//   GET /auth/logout            -> revoke + clear cookies + FloData sign-out
//   GET /api/auth/me            -> Person + {roles, mfa, account_url, logout_url}
// Mocks cannot sign in through FloData: requests act as the user chosen with
// localStorage "teampulse.mock.userId" (see ../http.ts).
import { http, HttpResponse } from "msw";
import { employee, reloadDb } from "../db";
import { API, authUser, unauthorized } from "../http";

const MOCK_ROLES: Record<string, string> = {
  admin: "teampulse:admin",
  manager: "teampulse:editor",
  employee: "teampulse:viewer",
};

export const authHandlers = [
  http.get(`${API}/integrations/google-chat`, ({ request }) =>
    authUser(request) === null
      ? unauthorized()
      : HttpResponse.json({
          inbound: false,
          outbound: false,
          connected: false,
          connected_at: null,
        }),
  ),

  http.get(`${API}/auth/me`, ({ request }) => {
    reloadDb();
    const userId = authUser(request);
    const user = userId === null ? undefined : employee(userId);
    return user
      ? HttpResponse.json({
          ...user,
          roles: [MOCK_ROLES[user.role] ?? "teampulse:viewer"],
          mfa: true,
          account_url: "https://fda-sso.duckdns.org/account",
          logout_url: "/auth/logout",
        })
      : unauthorized();
  }),
];
