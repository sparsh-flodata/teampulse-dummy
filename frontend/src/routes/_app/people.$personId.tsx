import { createFileRoute, notFound } from "@tanstack/react-router";
import { ProfilePage } from "@/features/organization/components/ProfilePage";

export const Route = createFileRoute("/_app/people/$personId")({
  staticData: { title: "Profile" },
  params: {
    parse: ({ personId }) => {
      const id = Number(personId);
      if (!Number.isInteger(id) || id <= 0) throw notFound();
      return { personId: id };
    },
    stringify: ({ personId }) => ({ personId: String(personId) }),
  },
  component: function PersonProfile() {
    const { personId } = Route.useParams();
    return <ProfilePage key={personId} personId={personId} />;
  },
});
