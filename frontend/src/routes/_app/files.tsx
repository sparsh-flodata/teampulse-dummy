import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { FilesPage } from "@/features/attachments/components/FilesPage";

// Team and project come from the shared workspace search (/_app); the person
// and the type are this page's own filters.
export const Route = createFileRoute("/_app/files")({
  staticData: { title: "Files & links" },
  validateSearch: z.object({
    person: z.coerce.number().int().positive().optional().catch(undefined),
    kind: z.enum(["files", "links"]).optional().catch(undefined),
  }),
  component: function FilesRoute() {
    const { person, kind } = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <FilesPage
        person={person}
        kind={kind}
        onFilters={(patch) =>
          void navigate({
            search: (prev) => ({ ...prev, ...patch }),
            replace: true,
            resetScroll: false,
          })
        }
      />
    );
  },
});
