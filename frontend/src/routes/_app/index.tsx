import { createFileRoute } from "@tanstack/react-router";
import { CommitmentsDashboard } from "@/features/dashboard/components/CommitmentsDashboard";

export const Route = createFileRoute("/_app/")({
  staticData: { title: "Overview" },
  component: () => <CommitmentsDashboard view="Overview" />,
});
