import { useCallback } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

export type View =
  | "Overview"
  | "My work"
  | "All commitments"
  | "Projects"
  | "Dependencies"
  | "Team & capacity"
  | "Activity"
  | "AI chat"
  | "Settings"
  | "My profile"
  | "My team"
  | "Organization"
  | "Profile";

export const viewPaths = {
  Overview: "/",
  "My work": "/my-work",
  "All commitments": "/commitments",
  Projects: "/projects",
  Dependencies: "/dependencies",
  "Team & capacity": "/capacity",
  Activity: "/activity",
  "AI chat": "/chat",
  Settings: "/settings",
  "My profile": "/me",
  "My team": "/team",
  Organization: "/organization",
} as const satisfies Record<Exclude<View, "Profile">, string>;

export type FormKind = "work" | "project" | "employee" | "dependency";
export type WorkScope = "personal" | "team" | "organization";

const scope = z.enum(["personal", "team", "organization"]);
const id = z.coerce.number().int().positive();

/**
 * Search params shared by every signed-in page. Filters, the open work item
 * and the create dialog live in the URL so links, refresh and Back work.
 * Invalid values are dropped rather than failing the page.
 */
export const workspaceSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  work: id.optional().catch(undefined),
  create: z
    .enum(["work", "project", "employee", "dependency"])
    .optional()
    .catch(undefined),
  scope: scope.optional().catch(undefined),
  drill: scope.optional().catch(undefined),
  status: z.string().optional().catch(undefined),
  project: id.optional().catch(undefined),
  team: id.optional().catch(undefined),
});

export type WorkspaceSearch = z.infer<typeof workspaceSearchSchema>;

export function useWorkspaceSearch(): WorkspaceSearch {
  return useSearch({ from: "/_app" });
}

/** Navigation helpers mirroring the old app's view switching. */
export function useWorkspaceNavigation() {
  const navigate = useNavigate();

  const patchSearch = useCallback(
    (patch: Partial<WorkspaceSearch>, replace = false) =>
      navigate({
        to: ".",
        search: (prev: WorkspaceSearch) => ({ ...prev, ...patch }),
        replace,
      }),
    [navigate],
  );

  return {
    /** Go to a page with a fresh filter set (status defaults to "active"). */
    go: (
      view: Exclude<View, "Profile">,
      extra: Partial<WorkspaceSearch> = {},
    ) => {
      window.scrollTo(0, 0);
      return navigate({ to: viewPaths[view], search: extra });
    },
    openProfile: (personId: number) => {
      window.scrollTo(0, 0);
      return navigate({
        to: "/people/$personId",
        params: { personId },
      });
    },
    openWork: (workId: number) => patchSearch({ work: workId }),
    closeWork: () => patchSearch({ work: undefined }),
    openCreate: (kind: FormKind, workId?: number) =>
      patchSearch({ create: kind, ...(workId ? { work: workId } : {}) }),
    closeCreate: () => patchSearch({ create: undefined }),
    patchSearch,
  };
}
