import { useEffect, useRef, useState } from "react";
import {
  Outlet,
  useMatches,
  useNavigate,
  useParams,
  useRouterState,
} from "@tanstack/react-router";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Search,
  Bell,
  Plus,
  ChevronRight,
  CalendarDays,
  Menu,
  ShieldCheck,
  Sun,
  Wifi,
  GitBranch,
  UserRound,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import { BREATH_OUT_MS, MotionProvider, usePageLeaving } from "@/lib/motion";
import { AccountMenu } from "@/features/auth/components/AccountMenu";
import { ModalHost } from "./ModalHost";
import { stateQuery } from "../api";
import { isManager } from "../domain";
import { useMediaQuery, useWorkspace } from "../hooks";
import {
  useWorkspaceNavigation,
  useWorkspaceSearch,
  type View,
  type WorkScope,
} from "../navigation";
import { NotificationsPopover } from "./NotificationsPopover";
import { Sidebar } from "./Sidebar";
import { Toast } from "./Toast";

const descriptions: Record<View, string> = {
  Overview: "A little clarity on where things stand.",
  "My work": "Your commitments, your priorities, your space.",
  "All commitments": "A shared view of what the team is delivering.",
  Projects: "The bigger picture, one initiative at a time.",
  Dependencies: "See what's waiting. Help work move forward.",
  "Team & capacity": "Make room for the right work, together.",
  Activity: "The context behind every change.",
  Settings: "Make TeamPulse work at your rhythm.",
  "AI chat": "Give instructions, coordinate updates, and keep work in sync.",
  "My profile":
    "Your commitments, delivery context, and capacity in one place.",
  "My team": "A clear view of your direct and indirect reports.",
  Organization: "Understand where everyone fits, and how work connects.",
  Profile: "A complete work profile, within your reporting permissions.",
  Project:
    "Everything about this project: its people, commitments, and progress.",
};

/** Pages where typing in the global search jumps to All commitments. */
const SEARCH_REDIRECT: View[] = [
  "Profile",
  "My profile",
  "My team",
  "Organization",
  "Settings",
];

function greeting(name: string) {
  const hour = new Date().getHours();
  return `Good ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}, ${name.split(" ")[0]}`;
}

export function AppShell() {
  const state = useWorkspace();
  const { error, refetch } = useQuery(stateQuery);
  const view: View =
    useMatches({ select: (m) => m.at(-1)?.staticData.title }) ?? "Overview";
  const { personId, projectId } = useParams({ strict: false });
  const search = useWorkspaceSearch();
  const nav = useWorkspaceNavigation();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const leaving = usePageLeaving(pathname);
  const [mobile, setMobile] = useState(false),
    [notices, setNotices] = useState(false),
    [accountsOpen, setAccountsOpen] = useState(false);
  const smallScreen = useMediaQuery("(max-width:760px)");
  const searchRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  // Mobile navigation drawer: focus trap + Escape, restoring focus on close.
  useEffect(() => {
    if (!mobile || !smallScreen) return;
    const previous = document.activeElement as HTMLElement | null;
    const sidebar = sidebarRef.current;
    sidebar?.querySelector<HTMLElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobile(false);
      if (e.key === "Tab") {
        const items = sidebar?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,select",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [mobile, smallScreen]);

  // Ctrl/Cmd+K focuses the workspace search.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);

  const me = state.user,
    manager = isManager(me),
    overviewScope = search.scope ?? "personal",
    unread = state.notifications.filter((n) => !n.read).length,
    connection = error ? error.message : "";

  const goTo = (target: Exclude<View, "Profile" | "Project">) => {
    setMobile(false);
    void nav.go(target);
  };
  const setScope = (scope: WorkScope) =>
    nav.patchSearch({ scope: scope === "personal" ? undefined : scope });

  return (
    <MotionProvider>
      <div className="app-shell">
        {mobile && (
          <div className="mobile-backdrop" onClick={() => setMobile(false)} />
        )}
        <Sidebar
          state={state}
          view={view}
          mobile={mobile}
          smallScreen={smallScreen}
          sidebarRef={sidebarRef}
          onNavigate={goTo}
          onCreateProject={() => {
            setMobile(false);
            void nav.openCreate("project");
          }}
          onProject={(id) => {
            setMobile(false);
            void nav.openProject(id);
          }}
          onClose={() => setMobile(false)}
          onLogout={() => {
            // Sign-out lives in the account menu (one account or all).
            setMobile(false);
            setNotices(false);
            setAccountsOpen(true);
          }}
        />
        <div
          className={"app-main" + (view === "AI chat" ? " has-chat" : "")}
          inert={smallScreen && mobile}
        >
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button menu-toggle"
                aria-label="Open navigation"
                onClick={() => setMobile(true)}
              >
                <Menu size={19} />
              </button>
              <span>Workspace</span>
              <ChevronRight size={13} />
              <strong>{view}</strong>
            </div>
            <div className="topbar-actions">
              <div className="global-search">
                <Search size={16} />
                <input
                  ref={searchRef}
                  value={search.q ?? ""}
                  onChange={(e) => {
                    const q = e.target.value || undefined;
                    if (SEARCH_REDIRECT.includes(view))
                      void navigate({
                        to: "/commitments",
                        search: { status: "all", q },
                      });
                    else void nav.patchSearch({ q }, true);
                  }}
                  placeholder="Search your workspace…"
                  aria-label="Search workspace"
                />
                <kbd>Ctrl K</kbd>
              </div>
              <span className="topbar-divider" />
              <button
                className={
                  "icon-button notification-button " +
                  (unread ? "has-notifications" : "")
                }
                aria-label={"Notifications, " + unread + " unread"}
                onClick={() => {
                  setAccountsOpen(false);
                  setNotices(!notices);
                }}
              >
                <Bell size={19} />
              </button>
              <button
                className="account-trigger"
                data-account-trigger
                aria-label={"Accounts · signed in as " + me.name}
                aria-haspopup="menu"
                aria-expanded={accountsOpen}
                onClick={() => {
                  setNotices(false);
                  setAccountsOpen(!accountsOpen);
                }}
              >
                <Avatar person={me} size={31} />
              </button>
            </div>
          </header>
          <motion.main
            className={view === "AI chat" ? "chat-page" : ""}
            initial={false}
            animate={
              leaving
                ? { opacity: 0, y: -6, scale: 0.992 }
                : { opacity: 1, y: 0, scale: 1 }
            }
            transition={{ duration: BREATH_OUT_MS / 1000, ease: "easeOut" }}
          >
            <div className="page-heading">
              <div>
                <div className="heading-eyebrow">
                  {view === "Overview" ? (
                    <>
                      <Sun size={15} />
                      Your team, in sync
                    </>
                  ) : (
                    "FloData workspace"
                  )}
                </div>
                <h1>
                  {view === "Overview" ? greeting(me.name) : ""}
                  <span className="greeting-dot">
                    {view === "Overview" ? "." : ""}
                  </span>
                  {view !== "Overview" &&
                    (view === "Profile"
                      ? state.directory.find((p) => p.id === Number(personId))
                          ?.name || "Individual profile"
                      : view === "Project"
                        ? state.projects.find((p) => p.id === Number(projectId))
                            ?.name || "Project"
                        : view)}
                </h1>
                <p>{descriptions[view]}</p>
              </div>
              <div className="heading-actions">
                <span className="today-label">
                  <CalendarDays size={15} />
                  {new Date(state.today + "T12:00:00").toLocaleDateString(
                    "en-IN",
                    {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    },
                  )}
                </span>
                {["Overview", "My work", "All commitments", "Project"].includes(
                  view,
                ) && (
                  <button
                    className="button primary"
                    onClick={() => nav.openCreate("work")}
                  >
                    <Plus size={16} />
                    New commitment
                  </button>
                )}
                {view === "Projects" && manager && (
                  <button
                    className="button primary"
                    onClick={() => nav.openCreate("project")}
                  >
                    <Plus size={16} />
                    New project
                  </button>
                )}
                {view === "Team & capacity" && manager && (
                  <button
                    className="button primary"
                    onClick={() => nav.openCreate("employee")}
                  >
                    <Plus size={16} />
                    Add teammate
                  </button>
                )}
              </div>
            </div>
            {view === "Overview" && (
              <div className="workspace-context">
                <div className="context-tabs">
                  <button
                    className={overviewScope === "personal" ? "active" : ""}
                    onClick={() => setScope("personal")}
                  >
                    <UserRound size={15} />
                    My workspace
                  </button>
                  {manager && (
                    <button
                      className={overviewScope === "team" ? "active" : ""}
                      onClick={() => setScope("team")}
                    >
                      <Users size={15} />
                      Reporting team
                    </button>
                  )}
                  {state.can_manage_org && (
                    <button
                      className={
                        overviewScope === "organization" ? "active" : ""
                      }
                      onClick={() => setScope("organization")}
                    >
                      <GitBranch size={15} />
                      Organization
                    </button>
                  )}
                </div>
                <span>
                  <ShieldCheck size={13} />
                  {overviewScope === "personal"
                    ? "Your own commitments"
                    : overviewScope === "team"
                      ? "Direct and indirect reports"
                      : "Organization-wide access"}
                </span>
              </div>
            )}
            {state.demo_mode && (
              <div className="sample-workspace-note">
                <ShieldCheck size={13} />
                <span>Demo projects</span>{" "}
                <span className="sample-note-detail">
                  {state.organization_source
                    ? "Reporting and departments follow your organization file. Projects and work are fictional."
                    : "Sample projects and work are illustrative and editable."}
                </span>
              </div>
            )}
            {connection && (
              <div className="error connection-error">
                <Wifi size={16} />
                {connection}
                <button className="text-button" onClick={() => void refetch()}>
                  Reconnect
                </button>
              </div>
            )}
            <Outlet />
            <footer className="page-footer">
              <span>
                <span className="live-dot" />
                Your team's shared source of context
              </span>
              <span>Built for progress, with people in mind.</span>
            </footer>
          </motion.main>
        </div>
        <ModalHost />
        {notices && (
          <NotificationsPopover
            notifications={state.notifications}
            onClose={() => setNotices(false)}
          />
        )}
        {accountsOpen && <AccountMenu onClose={() => setAccountsOpen(false)} />}
        <Toast />
      </div>
    </MotionProvider>
  );
}
