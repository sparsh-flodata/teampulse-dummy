import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type {
  Activity,
  Dependency,
  DirectoryPerson,
  HealthSummary,
  Project,
  Work,
} from "@/features/workspace/types";

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

/** One project page: info, people, commitments, stats, dependencies, activity. */
export type ProjectMember = DirectoryPerson & {
  involvement: "Department" | "Invited" | "Contributor";
  is_lead: boolean;
  open_count: number;
  completed_count: number;
  remaining_hours: number;
  needs_action: number;
};

export type ProjectDetail = {
  project: {
    id: number;
    name: string;
    description: string;
    color: string;
    team_id: number;
    team_name: string | null;
    lead_id: number | null;
    health: HealthSummary;
  };
  today: string;
  members: ProjectMember[];
  work: Work[];
  stats: {
    total: number;
    active: number;
    completed: number;
    by_status: Record<string, number>;
    overdue: number;
    needs_action: number;
    needs_review: number;
    unassigned: number;
    awaiting_confirmation: number;
    remaining_hours: number;
    effort_hours: number;
    progress: number;
    start_date: string | null;
    target_date: string | null;
    next_due: number[];
  };
  dependencies: Dependency[];
  activity: Activity[];
  permissions: {
    can_assign: boolean;
    is_member: boolean;
    can_take: boolean;
    can_create: boolean;
  };
};

export const projectQuery = (projectId: number) =>
  queryOptions({
    queryKey: queryKeys.project(projectId),
    queryFn: () => api.get<ProjectDetail>(`/projects/${projectId}`),
    refetchInterval: 15_000,
  });

/** Kanban move: only the status changes; the server applies the usual rules. */
export const moveWork = (vars: { id: number; status: string }) =>
  api.patch<Work>(`/work/${vars.id}`, { status: vars.status, note: "" });
