import { useCallback } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { leavePage } from "@/lib/motion";

export type View =
  | "Overview"
  | "My work"
  | "All commitments"
  | "Projects"
  | "Dependencies"
  | "Team & capacity"
  | "Activity"
  | "Files & links"
  | "AI chat"
  | "Settings"
  | "My profile"
  | "My team"
  | "Organization"
  | "Profile"
  | "Project";

export const viewPaths = {
  Overview: "/",
  "My work": "/my-work",
  "All commitments": "/commitments",
  Projects: "/projects",
  Dependencies: "/dependencies",
  "Team & capacity": "/capacity",
  Activity: "/activity",
  "Files & links": "/files",
  "AI chat": "/chat",
  Settings: "/settings",
  "My profile": "/me",
  "My team": "/team",
  Organization: "/organization",
} as const satisfies Record<Exclude<View, "Profile" | "Project">, string>;

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

/** What pages filter by. Opening or closing a modal (work, create) does not change it. */
const pickFilters = (s: WorkspaceSearch) => ({
  q: s.q,
  scope: s.scope,
  drill: s.drill,
  status: s.status,
  project: s.project,
  team: s.team,
});
export type PageFilters = ReturnType<typeof pickFilters>;

/**
 * The page filters in the URL. Subscribing to only these keeps a page (and the shell)
 * from re-rendering every time a modal opens, which is what made modals stutter.
 */
export function useWorkspaceSearch(): PageFilters {
  return useSearch({
    from: "/_app",
    select: pickFilters,
    structuralSharing: true,
  });
}

/** The open modal, if any: a commitment (?work=) or a create form (?create=). */
export function useModalSearch() {
  return useSearch({
    from: "/_app",
    select: (s: WorkspaceSearch) => ({ work: s.work, create: s.create }),
    structuralSharing: true,
  });
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
        // Opening a dialog or typing a filter must not scroll the page behind it.
        resetScroll: false,
      }),
    [navigate],
  );

  return {
    /** Go to a page with a fresh filter set (status defaults to "active"). */
    go: async (
      view: Exclude<View, "Profile" | "Project">,
      extra: Partial<WorkspaceSearch> = {},
    ) => {
      await leavePage();
      window.scrollTo({ top: 0, behavior: "instant" });
      return navigate({ to: viewPaths[view], search: extra });
    },
    openProfile: async (personId: number) => {
      await leavePage();
      window.scrollTo({ top: 0, behavior: "instant" });
      return navigate({
        to: "/people/$personId",
        params: { personId },
      });
    },
    openProject: async (projectId: number) => {
      await leavePage();
      window.scrollTo({ top: 0, behavior: "instant" });
      return navigate({
        to: "/projects/$projectId",
        params: { projectId },
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
