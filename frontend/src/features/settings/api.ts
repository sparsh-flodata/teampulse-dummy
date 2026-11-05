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

/** Check-in preferences, with the server's schedule for the explanation. */
export type Preferences = {
  proactive_checkins: boolean;
  /** YYYY-MM-DD, org-local: check-ins resume on this day. */
  checkins_paused_until: string | null;
  checkin_hour: number;
  org_timezone: string;
  /** Check-ins are switched on for the workspace. */
  enabled: boolean;
};

export const preferencesQuery = () =>
  queryOptions({
    queryKey: queryKeys.preferences,
    queryFn: () => api.get<Preferences>("/me/preferences"),
  });

export const preferencesSchema = z
  .object({
    proactive_checkins: z.boolean(),
    // false resumes check-ins paused earlier.
    pause_until_tomorrow: z.boolean(),
  })
  .partial();
export type PreferencesInput = z.output<typeof preferencesSchema>;

export const updatePreferences = (body: PreferencesInput) =>
  api.patch<Preferences>("/me/preferences", preferencesSchema.parse(body));

export type CheckInPreview = {
  id: number;
  employee_id: number;
  employee_name: string;
  kind: "daily" | "request" | "file";
  status: string;
  period: string;
  clarify_rounds: number;
  items: { n: number; work_item_id: number; title: string }[];
  message: string;
  chat_delivery: string;
  created_at: string;
  expires_at: string;
};

export type CheckInsPreview = {
  date: string;
  enabled: boolean;
  dry_run: boolean;
  check_ins: CheckInPreview[];
};

export const adminCheckInsQuery = (date: string) =>
  queryOptions({
    queryKey: queryKeys.adminCheckIns(date),
    queryFn: () =>
      api.get<CheckInsPreview>(
        "/admin/check-ins?date=" + encodeURIComponent(date),
      ),
  });
