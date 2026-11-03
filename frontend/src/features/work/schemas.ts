import { z } from "zod";
import { numberField, optionalId } from "@/lib/forms";

export const PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
export const WORK_STATUSES = [
  "Planned",
  "In Progress",
  "Partially Blocked",
  "Blocked",
  "Awaiting Verification",
  "Completed",
] as const;

export const updateWorkSchema = z.object({
  status: z.enum(WORK_STATUSES),
  progress: numberField(0, 100, "Progress"),
  remaining_hours: numberField(0, 1000, "Remaining effort"),
  note: z.string().max(4000),
  accept_commitment: z.boolean(),
  /** Only sent by the owner. */
  due_date: z.string().min(1).optional(),
  /** Only sent by managers. */
  priority: z.enum(PRIORITIES).optional(),
});
export type UpdateWorkInput = z.output<typeof updateWorkSchema>;

export const createWorkSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Describe the deliverable in at least 3 characters.")
    .max(200),
  description: z.string().max(4000),
  project_id: z.coerce.number().int().positive("Choose a project."),
  owner_id: optionalId,
  priority: z.enum(PRIORITIES),
  due_date: z.string().min(1, "Choose an expected completion date."),
  effort_hours: numberField(0.5, 1000, "Estimated effort"),
  required_skills: z.string().max(500),
});
export type CreateWorkInput = z.output<typeof createWorkSchema>;

export const createDependencySchema = z.object({
  work_item_id: z.number().int().positive(),
  owner_id: z.coerce.number().int().positive("Choose the responsible person."),
  upstream_work_id: optionalId,
  deliverable: z
    .string()
    .trim()
    .min(3, "Describe the deliverable in at least 3 characters.")
    .max(200),
  reason: z.string().max(2000),
  due_date: z.string().min(1),
  impact: z.enum(["Low", "Medium", "High", "Critical"]),
  partial: z.enum(["partial", "full"]).transform((v) => v === "partial"),
});
export type CreateDependencyInput = z.output<typeof createDependencySchema>;
