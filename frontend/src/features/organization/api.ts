import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api/client";
import { optionalId } from "@/lib/forms";
import { queryKeys } from "@/lib/api/query-keys";
import type { Person, Profile, Team } from "@/features/workspace/types";

export const profileQuery = (personId: number) =>
  queryOptions({
    queryKey: queryKeys.profile(personId),
    queryFn: () => api.get<Profile>(`/people/${personId}/profile`),
    // Follows the workspace polling cadence, as the old profile view did.
    refetchInterval: 15_000,
  });

const ROLES = ["employee", "manager", "admin"] as const;

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(2, "Enter the full name.").max(120),
  email: z.email("Enter a valid work email.").max(254),
  password: z
    .string()
    .min(12, "The initial password needs at least 12 characters.")
    .max(256),
  title: z.string().trim().min(1).max(120),
  team_id: z.coerce.number().int().positive("Choose a team."),
  skills: z.string().max(500),
  role: z.enum(["employee", "manager"]),
  manager_id: optionalId,
});
export type CreateEmployeeInput = z.output<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  name: z.string().trim().min(2, "Enter the full name."),
  title: z.string().trim().min(2, "Enter a job title."),
  team_id: z.coerce.number().int().positive(),
  manager_id: optionalId,
  role: z.enum(ROLES),
  active: z.boolean(),
});
export type UpdateEmployeeInput = z.output<typeof updateEmployeeSchema>;

export const teamSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name the department in at least 2 characters.")
    .max(120),
  parent_id: optionalId,
  lead_id: optionalId,
});
export type TeamInput = z.output<typeof teamSchema>;

export const createEmployee = (body: CreateEmployeeInput) =>
  api.post<Person>("/employees", body);

export const updateEmployee = ({
  id,
  ...body
}: UpdateEmployeeInput & { id: number }) => api.patch(`/employees/${id}`, body);

export const saveTeam = ({ id, ...body }: TeamInput & { id?: number }) =>
  id ? api.patch<Team>(`/teams/${id}`, body) : api.post<Team>("/teams", body);
