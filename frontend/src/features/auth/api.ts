import { apiRequest } from "@/lib/api/client";
import {
  loginResponseSchema,
  tokenPairSchema,
  type LoginResponse,
  type TokenPair,
} from "./types";

export async function login(email: string, password: string) {
  const data = await apiRequest<unknown>("/auth/login", {
    method: "POST",
    body: { email, password },
    anonymous: true,
  });
  return loginResponseSchema.parse(data) as LoginResponse;
}

/** Self-registration; the server only accepts allowed company email domains. */
export async function register(name: string, email: string, password: string) {
  const data = await apiRequest<unknown>("/auth/register", {
    method: "POST",
    body: { name, email, password },
    anonymous: true,
  });
  return loginResponseSchema.parse(data) as LoginResponse;
}

/** Rotating refresh: the presented refresh token is revoked by the server. */
export async function refresh(refreshToken: string): Promise<TokenPair> {
  const data = await apiRequest<unknown>("/auth/refresh", {
    method: "POST",
    body: { refresh_token: refreshToken },
    anonymous: true,
  });
  return tokenPairSchema.parse(data);
}

export function logout(refreshToken: string) {
  return apiRequest<{ ok: boolean }>("/auth/logout", {
    method: "POST",
    body: { refresh_token: refreshToken },
    anonymous: true,
  });
}
