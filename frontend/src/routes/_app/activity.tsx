import { createFileRoute } from "@tanstack/react-router";
import { ActivityPage } from "@/features/activity/components/ActivityPage";

export const Route = createFileRoute("/_app/activity")({
  staticData: { title: "Activity" },
  component: ActivityPage,
});
