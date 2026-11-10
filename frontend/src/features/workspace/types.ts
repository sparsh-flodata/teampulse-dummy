// Domain model shared by every workspace feature. Mirrors the API contract.

import type { Attachment } from "@/features/attachments/types";

export type Tone = "green" | "amber" | "red" | "neutral";

export type Capacity = {
  committed: number;
  usable: number;
  available: number | null;
  estimated_available: number;
  state: string;
  confirmed: boolean;
  blocked_count: number;
  utilization: number;
};

export type HealthSummary = {
  tone: Tone;
  label: string;
  counts: Record<Tone, number>;
  active: number;
  completed: number;
};

export type Role = "employee" | "manager" | "admin";

export type DirectoryPerson = {
  id: number;
  name: string;
  title: string;
  role: string;
  team_id: number;
  manager_id: number | null;
  color: string;
  active: boolean;
  can_view_profile: boolean;
  direct_reports: number;
};

export type Team = {
  id: number;
  name: string;
  parent_id: number | null;
  lead_id: number | null;
};

export type Person = {
  id: number;
  name: string;
  email: string;
  title: string;
  role: string;
  team_id: number;
  manager_id: number | null;
  skills: string;
  color: string;
  weekly_hours: number;
  reserved_hours: number;
  planning: string;
  capacity: Capacity;
  active: boolean;
  agent_auto_updates: boolean;
  proactive_checkins: boolean;
  /** YYYY-MM-DD, org-local; check-ins skip days before it and resume on it. */
  checkins_paused_until: string | null;
};

export type Project = {
  id: number;
  name: string;
  description: string;
  team_id: number;
  color: string;
  member_ids: number[];
  health: HealthSummary;
};

export type Work = {
  id: number;
  title: string;
  description: string;
  project_id: number;
  owner_id: number | null;
  status: string;
  priority: string;
  progress: number;
  remaining_hours: number;
  required_skills: string;
  risk: boolean;
  confirmed_at: string | null;
  health: string;
  tone: Tone;
  health_reason: string;
  next_action: string;
  can_edit: boolean;
  due_date: string;
  start_date: string;
  effort_hours: number;
  revision: number;
  commitment_confirmed: boolean;
};

export type Dependency = {
  id: number;
  work_item_id: number;
  upstream_work_id: number | null;
  requester_id: number;
  owner_id: number;
  deliverable: string;
  reason: string;
  due_date: string;
  impact: string;
  partial: boolean;
  status: string;
  downstream_count: number;
  tone: Tone;
};

export type Activity = {
  id: number;
  actor_id: number;
  work_item_id: number | null;
  message: string;
  created_at: string;
};

export type Notice = {
  id: number;
  message: string;
  work_item_id: number | null;
  read: boolean;
  update_request_id?: number | null;
  created_at: string;
};

export type WorkspaceState = {
  user: Person;
  today: string;
  teams: Team[];
  directory: DirectoryPerson[];
  profile_ids: number[];
  report_ids: number[];
  can_manage_org: boolean;
  health: HealthSummary;
  employees: Person[];
  projects: Project[];
  work: Work[];
  dependencies: Dependency[];
  activity: Activity[];
  notifications: Notice[];
  assistant_connected: boolean;
  demo_mode?: boolean;
  organization_source?: string | null;
};

export type Profile = {
  person: Person;
  manager: DirectoryPerson | null;
  reports: DirectoryPerson[];
  work: Work[];
  health: HealthSummary;
  dependencies: Dependency[];
  activity: Activity[];
  can_manage: boolean;
};

export type CommitmentRevision = {
  revision: number;
  start_date?: string;
  due_date: string;
  effort_hours?: number;
  reason: string;
  confirmed_by?: number | null;
};

export type UpdateRequest = {
  id: number;
  requester_id: number;
  recipient_id: number;
  requester_name: string;
  recipient_name: string;
  prompt: string;
  channel: string;
  status: string;
  delivery_detail: string;
  response: string | null;
  work_item_id: number | null;
  created_at: string;
  responded_at: string | null;
  can_reply: boolean;
  access_changed: boolean;
  /** Files and links sent with the reply (plan 9). */
  attachments?: Attachment[];
};

/** Only "Proposed" actions wait for a decision; the rest are history. */
export type AgentActionStatus =
  "Proposed" | "Approved" | "Rejected" | "Applied" | "Undone" | "Dismissed";

export type AgentAction = {
  id: number;
  payload: Record<string, unknown>;
  status: AgentActionStatus;
};

export type ChatMessage = {
  role: string;
  message: string;
  /** Which assistant agent answered (assistant messages only). */
  agent?: string | null;
};
