import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";
import {
  PROJECT_TABS,
  ProjectPage,
} from "@/features/projects/components/ProjectPage";

// "projects_" keeps this page out of the /projects grid's layout (a sibling, not a child).
export const Route = createFileRoute("/_app/projects_/$projectId")({
  staticData: { title: "Project" },
  params: {
    parse: ({ projectId }) => {
      const id = Number(projectId);
      if (!Number.isInteger(id) || id <= 0) throw notFound();
      return { projectId: id };
    },
    stringify: ({ projectId }) => ({ projectId: String(projectId) }),
  },
  validateSearch: z.object({
    tab: z.enum(PROJECT_TABS).optional().catch(undefined),
  }),
  component: function ProjectRoute() {
    const { projectId } = Route.useParams();
    const { tab = "Overview" } = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <ProjectPage
        key={projectId}
        projectId={projectId}
        tab={tab}
        onTab={(next) =>
          void navigate({
            search: (prev) => ({
              ...prev,
              tab: next === "Overview" ? undefined : next,
            }),
            replace: true,
            resetScroll: false,
          })
        }
      />
    );
  },
});
