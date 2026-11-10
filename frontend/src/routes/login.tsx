import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { LoginPage } from "@/features/auth/components/LoginPage";
import { getActiveAccount } from "@/features/auth/store";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({
    /** Adding another account while already signed in. */
    add: z.boolean().optional().catch(undefined),
    /** Email of an account whose session expired. */
    expired: z.string().optional().catch(undefined),
  }),
  ssr: false,
  beforeLoad: ({ search }) => {
    if (getActiveAccount() && !search.add && !search.expired)
      throw redirect({ to: "/" });
  },
  component: function Login() {
    const { add, expired } = Route.useSearch();
    return (
      <LoginPage
        key={(expired ?? "") + String(add)}
        mode={expired ? "expired" : add ? "add" : "signin"}
        email={expired}
      />
    );
  },
});
