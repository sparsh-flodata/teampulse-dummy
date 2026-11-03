import { createFileRoute } from "@tanstack/react-router";
import { DependenciesPage } from "@/features/dependencies/components/DependenciesPage";

export const Route = createFileRoute("/_app/dependencies")({
  staticData: { title: "Dependencies" },
  component: DependenciesPage,
});
