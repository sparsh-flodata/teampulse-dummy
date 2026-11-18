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

- Mocks cannot sign in through FloData, so every request acts as one seed account: `localStorage.setItem("teampulse.mock.userId", "<id>")` picks it (default: the first account).
- The mock database is shared by all tabs and persisted in localStorage, so a manager in one tab and an employee in another see each other's changes. Run `teampulseResetMocks()` in the browser console to restore the seed.
- Fixtures come from a snapshot of the legacy API: `node scripts/capture-mock-fixtures.mjs http://127.0.0.1:8787` regenerated `src/mocks/fixtures/seed.json` (it used password sign-in, which no longer exists; it needs updating before the next capture). Mutations are shallow: they apply the submitted fields but do not recompute server-derived fields such as health or capacity.

## Sign-in (FloData single sign-on)

The backend owns sign-in; the frontend never sees a token.

- The session is a pair of httpOnly cookies set by the backend at `/auth/callback`. Every request goes to the same origin (`credentials: "same-origin"`) with `X-TeamPulse-Request: 1`.
- The backend refreshes the access token silently. A **401** means the session is over: the fetch client sends the browser to `/auth/login?next=<current page>`, and FloData brings it back there.
- A **403** "You don't have access to this tool" means signed in but without a TeamPulse role in FloData Auth.
- `GET /api/auth/me` → `Person` plus `{roles, mfa, account_url, logout_url}`; the avatar menu shows the role ("managed in FloData Auth"), **My account** (FloData's account page) and **Sign out** (`/auth/logout`, which signs out of every FloData tool).
- In development, open `http://localhost:5173`: Vite proxies `/api` and `/auth` to 8787, so the cookies belong to the address registered in FloData Auth.
- Frontend role checks only shape the UI. The backend enforces every permission.

## Structure

```
src/
  routes/          __root, _app (loader + shell), _app/* pages
  features/<name>/ components, hooks, api.ts (query options + calls), schemas/types
  components/ui/   shared primitives (Avatar, Badge, Modal, …)
  lib/             api/client.ts, api/query-keys.ts, forms, format, ui-store
  mocks/           MSW handlers, mock database, fixtures
  styles/          tokens.css + ported stylesheets
```

To add a page, create `src/routes/_app/<name>.tsx` with `staticData: { title }` and a component from `features/`. Put shared filters in `workspaceSearchSchema` (`features/workspace/navigation.ts`). Writes go through `useWorkspaceMutation`, which refreshes the cache and shows the toast.
