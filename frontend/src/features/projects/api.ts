import { z } from "zod";
import { api } from "@/lib/api/client";
import type { Project } from "@/features/workspace/types";

export const PROJECT_COLORS = [
  { value: "#7256df", label: "Iris" },
  { value: "#278d88", label: "Sage" },
  { value: "#d58a43", label: "Amber" },
  { value: "#c96388", label: "Rose" },
] as const;

export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name the project in at least 2 characters.")
    .max(120),
  description: z.string().max(2000),
  team_id: z.coerce.number().int().positive("Choose a team."),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});
export type CreateProjectInput = z.output<typeof createProjectSchema>;

export const createProject = (body: CreateProjectInput) =>
  api.post<Project>("/projects", body);
