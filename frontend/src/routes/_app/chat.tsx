import { createFileRoute } from "@tanstack/react-router";
import { ChatWorkspace } from "@/features/chat/components/ChatWorkspace";

export const Route = createFileRoute("/_app/chat")({
  staticData: { title: "AI chat" },
  component: ChatWorkspace,
});
