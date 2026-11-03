import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginPage } from "@/features/auth/components/LoginPage";
import { getActiveAccount } from "@/features/auth/store";

export const Route = createFileRoute("/login")({
  ssr: false,
  beforeLoad: () => {
    if (getActiveAccount()) throw redirect({ to: "/" });
  },
  component: LoginPage,
});
