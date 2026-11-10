import { createFileRoute } from "@tanstack/react-router";
import { MyTeamPage } from "@/features/organization/components/MyTeamPage";

export const Route = createFileRoute("/_app/team")({
  staticData: { title: "My team" },
  component: MyTeamPage,
});
