import { HttpResponse } from "msw";
import { db, persist } from "./db";

export const API = "/api";

export const fail = (status: number, detail: string) =>
  HttpResponse.json({ detail }, { status });

/** FastAPI-style validation error. */
export const invalid = (msg: string) =>
  HttpResponse.json({ detail: [{ msg }] }, { status: 422 });

/** Mock sign-in key: the user id to act as (see handlers/auth.ts). */
export const MOCK_USER_KEY = "teampulse.mock.userId";

/**
 * The signed-in mock user. Real sign-in is FloData SSO (cookies set by the
 * backend), which mocks cannot do, so every request acts as one seed account:
 * localStorage "teampulse.mock.userId", else the first account.
 */
export function authUser(_request: Request): number | null {
  let chosen = NaN;
  try {
    chosen = Number(localStorage.getItem(MOCK_USER_KEY));
  } catch {
    // Storage blocked: use the first account.
  }
  const account =
    db.accounts.find((a) => a.user_id === chosen) ?? db.accounts[0];
  return account?.user_id ?? null;
}

export const unauthorized = () => fail(401, "Please sign in to continue.");

/** Wraps a mutating handler: persists the mock database afterwards. */
export function saved<T>(result: T): T {
  persist();
  return result;
}
