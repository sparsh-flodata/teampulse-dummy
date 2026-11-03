import { createFileRoute } from "@tanstack/react-router";
import { CapacityPage } from "@/features/capacity/components/CapacityPage";

export const Route = createFileRoute("/_app/capacity")({
  staticData: { title: "Team & capacity" },
  component: CapacityPage,
});
