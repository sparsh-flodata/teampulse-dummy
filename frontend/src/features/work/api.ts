import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type {
  CommitmentRevision,
  Dependency,
  Work,
} from "@/features/workspace/types";
import type {
  CreateDependencyInput,
  CreateWorkInput,
  UpdateWorkInput,
} from "./schemas";

export const workHistoryQuery = (workId: number) =>
  queryOptions({
    queryKey: queryKeys.workHistory(workId),
    queryFn: () => api.get<CommitmentRevision[]>(`/work/${workId}/history`),
  });

export const createWork = (body: CreateWorkInput) =>
  api.post<Work>("/work", body);

export const updateWork = ({ id, ...body }: UpdateWorkInput & { id: number }) =>
  api.patch<Work>(`/work/${id}`, body);

export const assignWork = (vars: { id: number; employee_id: number }) =>
  api.post(`/work/${vars.id}/assign`, { employee_id: vars.employee_id });

export const createDependency = (body: CreateDependencyInput) =>
  api.post<Dependency>("/dependencies", body);

export const updateDependency = (vars: { id: number; status: string }) =>
  api.patch<Dependency>(`/dependencies/${vars.id}`, { status: vars.status });
