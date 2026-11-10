/** A file or link sent with an update (plan 9). Names and notes are plain text. */
export type Attachment = {
  id: number;
  kind: "chat_upload" | "drive_file" | "link";
  name: string;
  content_type: string;
  note: string;
  /** ISO datetime, UTC. */
  created_at: string;
  work_item_id: number;
  project_id: number;
  employee_id: number;
  check_in_id: number | null;
  update_request_id: number | null;
  employee_name: string;
  employee_color: string;
  work_title: string;
  project_name: string;
  project_color: string;
  can_open: boolean;
  /** Relative, carries a short-lived per-viewer token. Null when it cannot be opened. */
  open_url: string | null;
  /** Inline image types only. */
  thumbnail_url: string | null;
};

export type AttachmentKindFilter = "files" | "links";

export type AttachmentFilters = {
  project_id?: number;
  team_id?: number;
  person_id?: number;
  work_item_id?: number;
  kind?: AttachmentKindFilter;
};

export type AttachmentPage = {
  items: Attachment[];
  next: { before: string; before_id: number } | null;
};
