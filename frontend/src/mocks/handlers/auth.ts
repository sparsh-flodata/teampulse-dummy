// JWT auth contract the future backend must implement:
//   POST /api/auth/login    {email, password}  -> {access_token, refresh_token, expires_in, user}
//   POST /api/auth/refresh  {refresh_token}    -> {access_token, refresh_token, expires_in}
//        (rotating: the presented refresh token is revoked; reuse is rejected)
//   POST /api/auth/logout   {refresh_token}    -> {ok: true}  (revokes it)
//   GET  /api/auth/me       Bearer access      -> Person
import { http, HttpResponse } from "msw";
import { DEMO_PASSWORD, db, employee, reloadDb } from "../db";
import { API, authUser, fail, saved, unauthorized } from "../http";

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Dev override for testing refresh: localStorage "teampulse.mock.accessTtl" (seconds). */
function accessTtl() {
  const override = Number(localStorage.getItem("teampulse.mock.accessTtl"));
  return override > 0 ? override : ACCESS_TTL_SECONDS;
}

const token = (kind: string) =>
  `mock-${kind}-${crypto.randomUUID().replaceAll("-", "")}`;

function issue(userId: number) {
  const ttl = accessTtl();
  const access_token = token("at"),
    refresh_token = token("rt");
  db.accessTokens[access_token] = {
    userId,
    expiresAt: Date.now() + ttl * 1000,
  };
  db.refreshTokens[refresh_token] = {
    userId,
    expiresAt: Date.now() + REFRESH_TTL_MS,
  };
  return { access_token, refresh_token, expires_in: ttl };
}

export const authHandlers = [
  http.post(`${API}/auth/login`, async ({ request }) => {
    const { email = "", password = "" } = (await request.json()) as {
      email?: string;
      password?: string;
    };
    reloadDb();
    const account = db.accounts.find(
      (a) => a.email.toLowerCase() === email.trim().toLowerCase(),
    );
    const user = employee(account?.user_id);
    if (!account || !user || password !== DEMO_PASSWORD || !user.active)
      return fail(401, "Email or password is incorrect.");
    return HttpResponse.json(saved({ ...issue(user.id), user }));
  }),

  // Sign-up needs the real backend: mock accounts come from the captured seed.
  http.post(`${API}/auth/register`, () =>
    fail(501, "Registration needs the real backend. Set VITE_API_MOCKS=false."),
  ),

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

  http.post(`${API}/auth/refresh`, async ({ request }) => {
    const { refresh_token = "" } = (await request.json()) as {
      refresh_token?: string;
    };
    reloadDb();
    const session = db.refreshTokens[refresh_token];
    if (!session || session.expiresAt <= Date.now())
      return fail(401, "Your session has expired. Please sign in again.");
    delete db.refreshTokens[refresh_token];
    return HttpResponse.json(saved(issue(session.userId)));
  }),

  http.post(`${API}/auth/logout`, async ({ request }) => {
    const { refresh_token = "" } = (await request.json()) as {
      refresh_token?: string;
    };
    reloadDb();
    delete db.refreshTokens[refresh_token];
    return HttpResponse.json(saved({ ok: true }));
  }),

  http.get(`${API}/auth/me`, ({ request }) => {
    reloadDb();
    const userId = authUser(request);
    return userId === null
      ? unauthorized()
      : HttpResponse.json(employee(userId));
  }),
];
