import { createFileRoute } from "@tanstack/react-router";
import { CommitmentsDashboard } from "@/features/dashboard/components/CommitmentsDashboard";

export const Route = createFileRoute("/_app/commitments")({
  staticData: { title: "All commitments" },
  component: () => <CommitmentsDashboard view="All commitments" />,
});
