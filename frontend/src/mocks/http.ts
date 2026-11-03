import { HttpResponse } from "msw";
import { db, persist } from "./db";

export const API = "/api";

export const fail = (status: number, detail: string) =>
  HttpResponse.json({ detail }, { status });

/** FastAPI-style validation error. */
export const invalid = (msg: string) =>
  HttpResponse.json({ detail: [{ msg }] }, { status: 422 });

/** Resolves the signed-in mock user from the Bearer token, or null. */
export function authUser(request: Request): number | null {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const session = db.accessTokens[token];
  if (!session || session.expiresAt <= Date.now()) return null;
  return session.userId;
}

export const unauthorized = () => fail(401, "Please sign in to continue.");

/** Wraps a mutating handler: persists the mock database afterwards. */
export function saved<T>(result: T): T {
  persist();
  return result;
}
