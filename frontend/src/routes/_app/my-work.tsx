import { createFileRoute } from "@tanstack/react-router";
import { CommitmentsDashboard } from "@/features/dashboard/components/CommitmentsDashboard";

export const Route = createFileRoute("/_app/my-work")({
  staticData: { title: "My work" },
  component: () => <CommitmentsDashboard view="My work" />,
});
