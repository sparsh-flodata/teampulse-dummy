import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSelector } from "@tanstack/react-store";
import { Check, LogOut, Plus, X } from "lucide-react";
import { Avatar } from "@/components/ui";
import { signOut, signOutAll, switchAccount } from "../session";
import { PER_TAB_ACCOUNTS, authStore } from "../store";

/** Gmail-style account switcher opened from the top-bar avatar. */
export function AccountMenu({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const { accounts, activeAccountId } = useSelector(authStore, (s) => s);
  const list = Object.entries(accounts);
  const active = activeAccountId ? accounts[activeAccountId] : undefined;
  const firstName = (active?.name ?? active?.email ?? "").split(" ")[0];

  // Close on Escape or a click outside; focus the menu when it opens.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const menu = ref.current;
    menu?.querySelector<HTMLElement>("button")?.focus();
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

  const run = (action: () => unknown) => () => {
    onClose();
    void action();
  };

  return (
    <div className="account-menu" role="menu" aria-label="Accounts" ref={ref}>
      <div className="split">
        <h3>Accounts</h3>
        <button
          className="icon-button"
          aria-label="Close accounts menu"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      <div className="account-list">
        {list.map(([id, account]) => (
          <button
            key={id}
            role="menuitemradio"
            aria-checked={id === activeAccountId}
            className={
              "account-option " + (id === activeAccountId ? "active" : "")
            }
            onClick={run(() => switchAccount(id))}
          >
            <Avatar
              person={{
                name: account.name ?? account.email,
                color: account.color ?? "",
              }}
              size={32}
            />
            <span>
              {account.name ?? account.email}
              <small>{account.email}</small>
            </span>
            {id === activeAccountId && <Check size={15} />}
          </button>
        ))}
      </div>
      <div className="account-actions">
        <button
          role="menuitem"
          onClick={run(() => navigate({ to: "/login", search: { add: true } }))}
        >
          <Plus size={15} />
          Add another account
        </button>
        {active && (
          <button role="menuitem" onClick={run(() => signOut())}>
            <LogOut size={15} />
            Sign out of {firstName}
          </button>
        )}
        {list.length > 1 && (
          <button role="menuitem" onClick={run(signOutAll)}>
            <LogOut size={15} />
            Sign out of all accounts
          </button>
        )}
      </div>
      {PER_TAB_ACCOUNTS && list.length > 1 && (
        <small className="account-note">
          Development: each tab keeps its own active account.
        </small>
      )}
    </div>
  );
}
