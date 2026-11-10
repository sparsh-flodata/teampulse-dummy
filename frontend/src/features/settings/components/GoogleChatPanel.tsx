import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import { useWorkspaceMutation } from "@/features/workspace/hooks";
import { disconnectGoogleChat, googleChatQuery } from "../api";

/** Google Chat connection, tinted by state: green connected, amber to do, grey unavailable. */
export function GoogleChatPanel() {
  const { data, isPending, isError } = useQuery(googleChatQuery());
  const disconnect = useWorkspaceMutation(
    () => disconnectGoogleChat(),
    "Google Chat disconnected.",
  );
  const available = Boolean(data?.inbound);
  const tone = data?.connected ? "done" : available ? "warn" : "wait";
  return (
    <section className={"panel google-chat-panel tone-" + tone}>
      <MessageSquare size={20} />
      <div>
        <div className="split">
          <h3>Google Chat</h3>
          {isPending ? null : isError ? (
            <Badge value="Unavailable" tone="neutral" />
          ) : data.connected ? (
            <Badge value="Connected" tone="green" />
          ) : available ? (
            <Badge value="Not connected" tone="amber" />
          ) : (
            <Badge value="Not set up" tone="neutral" />
          )}
        </div>
        {isPending ? (
          <p>Checking your connection.</p>
        ) : isError ? (
          <p>The connection status didn’t load. Try again in a moment.</p>
        ) : data.connected ? (
          <>
            <p>
              Update requests reach you in Google Chat, and you can reply there
              in your own words. Connected{" "}
              {data.connected_at
                ? dateLabel(data.connected_at.slice(0, 10))
                : ""}
              .
            </p>
            <button
              className="button"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate(undefined)}
            >
              Disconnect
            </button>
          </>
        ) : available ? (
          <p>
            Open Google Chat, find the TeamPulse app, and send it a message. It
            connects to the account with the same work email.
          </p>
        ) : (
          <p>
            Your administrator hasn’t set up the Google Chat app yet. Requests
            still arrive in your TeamPulse inbox.
          </p>
        )}
      </div>
    </section>
  );
}
