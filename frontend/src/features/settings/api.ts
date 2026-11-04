import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { queryKeys } from "@/lib/api/query-keys";
import { api } from "@/lib/api/client";
import { numberField } from "@/lib/forms";
import type { Person } from "@/features/workspace/types";

export const PLANNING_OPTIONS = [
  "Hybrid",
  "Daily",
  "Weekly",
  "On-demand",
] as const;

export const availabilitySchema = z.object({
  planning: z.enum(PLANNING_OPTIONS),
  weekly_hours: numberField(0, 80, "Working time"),
  reserved_hours: numberField(0, 80, "Reserved time"),
  capacity_confirmed: z.boolean(),
  agent_auto_updates: z.boolean(),
});
export type AvailabilityInput = z.output<typeof availabilitySchema>;

export const updateAvailability = (body: AvailabilityInput) =>
  api.patch<Person>("/me/availability", body);

/** Google Chat app connection for the signed-in person. */
export type GoogleChatStatus = {
  /** The server accepts events from the Chat app. */
  inbound: boolean;
  /** The server can send messages through the Chat app. */
  outbound: boolean;
  connected: boolean;
  connected_at: string | null;
};

export const googleChatQuery = () =>
  queryOptions({
    queryKey: queryKeys.googleChat,
    queryFn: () => api.get<GoogleChatStatus>("/integrations/google-chat"),
  });

export const disconnectGoogleChat = () =>
  api.post<GoogleChatStatus>("/integrations/google-chat/disconnect");
