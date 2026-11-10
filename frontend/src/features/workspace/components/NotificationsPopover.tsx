import { Bell, X } from "lucide-react";
import { Empty } from "@/components/ui";
import { ago } from "@/lib/format";
import { markNotificationRead } from "../api";
import { useNow, useWorkspaceMutation } from "../hooks";
import { useWorkspaceNavigation } from "../navigation";
import type { Notice } from "../types";
import { showToast } from "@/lib/ui-store";

export function NotificationsPopover({
  notifications,
  onClose,
}: {
  notifications: Notice[];
  onClose: () => void;
}) {
  const now = useNow();
  const nav = useWorkspaceNavigation();
  const read = useWorkspaceMutation(markNotificationRead);
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <div className="notification-popover">
      <div className="split">
        <h3>
          Your notifications <span className="count">{unread}</span>
        </h3>
        <button
          className="icon-button"
          aria-label="Close notifications"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      {notifications.length ? (
        notifications.map((n) => (
          <button
            key={n.id}
            className={"notice " + (!n.read ? "unread" : "")}
            onClick={async () => {
              try {
                await read.mutateAsync(n.id);
                if (n.update_request_id) await nav.go("AI chat");
                else if (n.work_item_id) await nav.openWork(n.work_item_id);
                onClose();
              } catch (e) {
                showToast((e as Error).message);
              }
            }}
          >
            <span className="notice-icon">
              <Bell size={15} />
            </span>
            <span>
              {n.message}
              <small>{ago(n.created_at, now)}</small>
            </span>
            {!n.read && <i />}
          </button>
        ))
      ) : (
        <Empty
          title="All quiet for now"
          description="You'll hear about meaningful changes here."
        />
      )}
    </div>
  );
}
