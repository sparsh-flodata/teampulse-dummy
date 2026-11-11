import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { RoadmapPage } from "@/features/roadmap/components/RoadmapPage";

export const Route = createFileRoute("/_app/roadmap")({
  staticData: { title: "Roadmap" },
  validateSearch: z.object({
    tab: z.enum(["yours", "team"]).optional().catch(undefined),
    person: z.coerce.number().int().positive().optional().catch(undefined),
  }),
  component: function RoadmapRoute() {
    const { tab, person } = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <RoadmapPage
        tab={tab}
        person={person}
        onSearch={(patch) =>
          void navigate({
            search: (prev) => ({ ...prev, ...patch }),
            resetScroll: false,
          })
        }
      />
    );
  },
});
