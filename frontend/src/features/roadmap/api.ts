import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";

/** Roadmaps are dummy data, generated on the server (services/roadmap.py). */
export type MilestoneStatus = "done" | "in_progress" | "planned";

export type Milestone = {
  id: string;
  title: string;
  kind: "Delivery" | "Skill" | "Impact";
  status: MilestoneStatus;
  progress: number;
  due: string;
};

export type RoadmapPhase = {
  name: string;
  when: "current" | "next" | "later";
  milestones: Milestone[];
};

export type RoadmapPerson = {
  id: number;
  name: string;
  title: string;
  color: string;
  team_id: number;
  manager_id: number | null;
};

export type Roadmap = {
  person: RoadmapPerson;
  track: string;
  phases: RoadmapPhase[];
  percent: number;
  done: number;
  in_progress: number;
  total: number;
  next_milestone: string | null;
};

export type RoadmapSummary = Omit<Roadmap, "phases"> & { direct: boolean };

/** One roadmap: your own ("me"), or someone below you in the reporting line. */
export const roadmapQuery = (personId: number | "me") =>
  queryOptions({
    queryKey: queryKeys.roadmap(personId),
    queryFn: () =>
      api.get<Roadmap>(`/roadmaps/${personId === "me" ? "me" : personId}`),
  });

/** Everyone below you in the reporting line, with how far along each roadmap is. */
export const teamRoadmapsQuery = queryOptions({
  queryKey: queryKeys.teamRoadmaps,
  queryFn: () => api.get<RoadmapSummary[]>("/roadmaps/team"),
});
