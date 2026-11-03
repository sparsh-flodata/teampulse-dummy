import { z } from "zod";
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
