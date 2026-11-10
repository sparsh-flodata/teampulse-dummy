import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/features/organization/components/ProfilePage";
import { useWorkspace } from "@/features/workspace/hooks";

export const Route = createFileRoute("/_app/me")({
  staticData: { title: "My profile" },
  component: function MyProfile() {
    return <ProfilePage personId={useWorkspace().user.id} />;
  },
});
