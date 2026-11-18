import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, LogOut, X } from "lucide-react";
import { Avatar } from "@/components/ui";
import { SIGN_OUT_URL } from "@/lib/api/client";
import { sessionQuery } from "../api";

const ROLE_LABELS: Record<string, string> = {
  employee: "Employee",
  manager: "Manager",
  admin: "Management / administrator",
};

/** Signed-in account, opened from the top-bar avatar. Identity is FloData's. */
export function AccountMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { data: me } = useQuery(sessionQuery);

  // Close on Escape or a click outside; focus the menu when it opens.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const menu = ref.current;
    menu?.querySelector<HTMLElement>("a, button")?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    const click = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!menu?.contains(target) && !target.closest("[data-account-trigger]"))
        closeRef.current();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", click);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", click);
    };
  }, []);

  return (
    <div className="account-menu" role="menu" aria-label="Account" ref={ref}>
      <div className="split">
        <h3>Account</h3>
        <button
          className="icon-button"
          aria-label="Close account menu"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      {me && (
        <div className="account-list">
          <div className="account-option active">
            <Avatar person={me} size={32} />
            <span>
              {me.name}
              <small>{me.email}</small>
            </span>
          </div>
          <small className="account-note">
            {ROLE_LABELS[me.role] ?? me.role} · managed in FloData Auth
          </small>
        </div>
      )}
      <div className="account-actions">
        {me && (
          <a
            role="menuitem"
            href={me.account_url}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={15} />
            My account
          </a>
        )}
        {/* Full navigation: the backend revokes the session and signs out of FloData. */}
        <a role="menuitem" href={me?.logout_url ?? SIGN_OUT_URL}>
          <LogOut size={15} />
          Sign out of all FloData tools
        </a>
      </div>
    </div>
  );
}
