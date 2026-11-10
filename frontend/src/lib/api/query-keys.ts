// Query key conventions: ["<resource>", ...identifiers, "<sub-resource>"].
// Every mutation invalidates the whole cache (see useWorkspaceMutation), so
// keys only need to be unique and stable.
export const queryKeys = {
  state: ["state"] as const,
  workHistory: (workId: number) => ["work", workId, "history"] as const,
  profile: (personId: number) => ["people", personId, "profile"] as const,
  updateRequests: ["update-requests"] as const,
  assistantHistory: ["assistant", "history"] as const,
  googleChat: ["integrations", "google-chat"] as const,
  preferences: ["me", "preferences"] as const,
  adminCheckIns: (date: string) => ["admin", "check-ins", date] as const,
  project: (projectId: number) => ["projects", projectId] as const,
  attachments: (filters: Record<string, unknown>) =>
    ["attachments", filters] as const,
};
