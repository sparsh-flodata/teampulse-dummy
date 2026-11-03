# Frontend

TanStack Start in SPA mode (`ssr: false`), TypeScript, pnpm. FastAPI stays the only server: `pnpm build` emits a static shell at `frontend/dist/client/index.html`, which FastAPI serves for every non-API path.

| Concern | Tool |
| --- | --- |
| Routing | TanStack Router, file-based (`src/routes`) |
| Server data | TanStack Query, one shared fetch client |
| App state (accounts, toasts) | TanStack Store |
| Forms | TanStack Form + zod (native validation attributes kept) |
| Styling | Plain CSS; design tokens in `src/styles/tokens.css` |
| Mock API | MSW, development only |

## Commands

```powershell
pnpm dev         # http://127.0.0.1:5173, mock API by default
pnpm typecheck
pnpm lint        # also enforces: no console, no dangerouslySetInnerHTML
pnpm build
```

## Mock API and switching to the real backend

`frontend/.env.development` sets `VITE_API_MOCKS=true`. MSW then answers every `/api` call in the browser. Set it to `false` to use the real backend through the Vite proxy (`/api` → `127.0.0.1:8787`). Production builds never include the mocks.

- Demo accounts: `ujjwal@`, `nitish.kumar@`, `kapil.sharma@flodataanalytics.com`, password `TeamPulse-demo-2026!`.
- The mock database is shared by all tabs and persisted in localStorage, so a manager in one tab and an employee in another see each other's changes. Run `teampulseResetMocks()` in the browser console to restore the seed.
- To exercise token refresh quickly: `localStorage.setItem("teampulse.mock.accessTtl", "10")` (seconds), then sign in again.
- Fixtures come from a snapshot of the legacy API: `node scripts/capture-mock-fixtures.mjs http://127.0.0.1:8787` regenerates `src/mocks/fixtures/seed.json`. Mutations are shallow: they apply the submitted fields but do not recompute server-derived fields such as health or capacity.

## Auth contract (for the backend rebuild)

All requests send `X-TeamPulse-Request: 1`. Authenticated requests also send `Authorization: Bearer <access_token>`.

| Endpoint | Body | Response |
| --- | --- | --- |
| `POST /api/auth/login` | `{email, password}` | `{access_token, refresh_token, expires_in, user}` |
| `POST /api/auth/refresh` | `{refresh_token}` | `{access_token, refresh_token, expires_in}` |
| `POST /api/auth/logout` | `{refresh_token}` | `{ok: true}` |
| `GET /api/auth/me` | | `Person` |

- Access tokens last 15 minutes. Refresh tokens last 7 days.
- Refresh tokens **rotate**: each refresh revokes the presented token, and reusing it returns 401.
- Logout revokes the refresh token server-side.
- Auth responses are validated with zod on the client.
- The data endpoints keep the existing shapes (`/api/state`, `/api/work/:id`, …).

## Accounts

- Several accounts can be signed in at once. The store is persisted in localStorage as `{ activeAccountId, accounts: { [id]: { userId, email, accessToken, refreshToken, name, color } } }`.
- **Switcher:** open it from the top-bar avatar or the sidebar's sign-out button. It offers "add another account", "sign out of one" and "sign out of all". Switching clears the query cache and opens Overview.
- **On a 401**, the fetch client refreshes once and retries the request.
  - Refreshes are deduplicated within a tab and serialized across tabs with a Web Lock. Chromium delivers another tab's localStorage writes asynchronously, so a tab that had to wait for the lock briefly waits for the other tab's new tokens instead of reusing a rotated one.
  - If the refresh fails, only the account that owned the failing token is removed, and the user is asked to sign in again.
- **Active account:**
  - Production: shared by all tabs.
  - Development: per tab, so you can act as two people at once. New tabs start on the last-used account.
- Every local change to accounts is applied on top of the latest persisted state, so tabs never overwrite each other's token rotations or sign-outs.
- Frontend role checks only shape the UI. The backend enforces every permission.

## Structure

```
src/
  routes/          __root, login, _app (guard + loader + shell), _app/* pages
  features/<name>/ components, hooks, api.ts (query options + calls), schemas/types
  components/ui/   shared primitives (Avatar, Badge, Modal, …)
  lib/             api/client.ts, api/query-keys.ts, forms, format, ui-store
  mocks/           MSW handlers, mock database, fixtures
  styles/          tokens.css + ported stylesheets
```

To add a page, create `src/routes/_app/<name>.tsx` with `staticData: { title }` and a component from `features/`. Put shared filters in `workspaceSearchSchema` (`features/workspace/navigation.ts`). Writes go through `useWorkspaceMutation`, which refreshes the cache and shows the toast.
