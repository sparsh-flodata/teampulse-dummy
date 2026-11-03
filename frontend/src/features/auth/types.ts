import { z } from "zod";
import type { Person } from "@/features/workspace/types";

/** One signed-in account. Persisted in localStorage. */
export type Account = {
  userId: number;
  email: string;
  accessToken: string;
  refreshToken: string;
};

export type AuthState = {
  activeAccountId: string | null;
  accounts: Record<string, Account>;
};

// Auth responses are validated at runtime: a contract mismatch here would
// break sign-in, so fail loudly instead of storing garbage tokens.
export const tokenPairSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

export const loginResponseSchema = tokenPairSchema.extend({
  user: z.looseObject({ id: z.number().int(), email: z.string() }),
});

export type TokenPair = z.infer<typeof tokenPairSchema>;
export type LoginResponse = TokenPair & { user: Person };
