import { apiRequest } from "@/lib/api/client";
import { loginResponseSchema, type LoginResponse } from "./types";

export async function login(email: string, password: string) {
  const data = await apiRequest<unknown>("/auth/login", {
    method: "POST",
    body: { email, password },
    anonymous: true,
  });
  return loginResponseSchema.parse(data) as LoginResponse;
}

export function logout(refreshToken: string) {
  return apiRequest<{ ok: boolean }>("/auth/logout", {
    method: "POST",
    body: { refresh_token: refreshToken },
    anonymous: true,
  });
}
