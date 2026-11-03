import { createFileRoute } from "@tanstack/react-router";
import { OrganizationPage } from "@/features/organization/components/OrganizationPage";

export const Route = createFileRoute("/_app/organization")({
  staticData: { title: "Organization" },
  component: OrganizationPage,
});
