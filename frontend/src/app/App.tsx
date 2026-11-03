import { ChatWorkspace } from "../features/chat/ChatWorkspace";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Users,
  Settings,
  Search,
  Bell,
  Plus,
  ChevronRight,
  CalendarDays,
  Activity,
  Menu,
  X,
  Check,
  ShieldCheck,
  Loader2,
  Sun,
  Wifi,
  GitBranch,
  UserRound,
} from "lucide-react";
import { Logo, Avatar, Empty } from "../components/ui";
import { CreateForm, FormKind } from "../features/work/CreateForm";
import { WorkDetail } from "../features/work/WorkDetail";
import { ProfileDashboard } from "../features/organization/ProfileDashboard";
import { MyTeam } from "../features/organization/MyTeam";
import { Organization } from "../features/organization/Organization";
import { Login } from "../features/auth/Login";
import { SettingsView } from "../features/settings/SettingsView";
import { Sidebar } from "../components/layout/Sidebar";
import { Dashboard } from "../features/dashboard/Dashboard";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { DependenciesPage } from "../features/dependencies/DependenciesPage";
import { CapacityPage } from "../features/capacity/CapacityPage";
import { ActivityPage } from "../features/activity/ActivityPage";
import {
  api,
  State,
  Work,
  View,
  Profile,
  ApiError,
  ago,
  isManager,
  openDependency,
  summarizeHealth,
} from "../lib";

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
};

export default function App() {
  const [state, setState] = useState<State | null>(null),
    [loading, setLoading] = useState(true),
    [auth, setAuth] = useState(false),
    [view, setView] = useState<View>("Overview"),
    [overviewScope, setOverviewScope] = useState("personal"),
    [drillScope, setDrillScope] = useState(""),
    [search, setSearch] = useState(""),
    [projectFilter, setProjectFilter] = useState(""),
    [teamFilter, setTeamFilter] = useState(""),
    [statusFilter, setStatusFilter] = useState("active"),
    [selectedId, setSelectedId] = useState<number | null>(null),
    [personId, setPersonId] = useState<number | null>(null),
    [form, setForm] = useState<FormKind | null>(null),
    [formWork, setFormWork] = useState<Work | undefined>(),
    [notices, setNotices] = useState(false),
    [toast, setToast] = useState(""),
    [mobile, setMobile] = useState(false),
    [smallScreen, setSmallScreen] = useState(
      () => window.matchMedia("(max-width:760px)").matches,
    ),
    [lastSync, setLastSync] = useState(new Date()),
    [connection, setConnection] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const lastUserId = useRef<number | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width:760px)");
    const update = () => setSmallScreen(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!mobile || !smallScreen) return;
    const previous = document.activeElement as HTMLElement;
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

  const refresh = useCallback(async (message = "") => {
    try {
      const result = await api<State>("/state");
      if (lastUserId.current !== result.user.id) {
        setView("Overview");
        setOverviewScope("personal");
        setDrillScope("");
        setPersonId(null);
        setSelectedId(null);
        setSearch("");
        lastUserId.current = result.user.id;
      }
      setState(result);
      setAuth(true);
      setLastSync(new Date());
      setConnection("");
      if (message) setToast(message);
    } catch (e) {
      const msg = (e as Error).message;
      if (e instanceof ApiError && e.status === 401) {
        setAuth(false);
        setState(null);
      } else setConnection(msg);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
    };
  }, [refresh]);
  useEffect(() => {
    if (!auth) return;
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [auth, refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const closeDetail = useCallback(() => setSelectedId(null), []),
    closePerson = useCallback(() => setPersonId(null), []),
    closeForm = useCallback(() => {
      setForm(null);
      setFormWork(undefined);
    }, []);
  function navigate(v: View, filter = "active") {
    window.scrollTo(0, 0);
    setDrillScope("");
    setSelectedId(null);
    setView(v);
    setStatusFilter(filter);
    setSearch("");
    setProjectFilter("");
    setTeamFilter("");
    setMobile(false);
  }
  function openProfile(id: number) {
    window.scrollTo(0, 0);
    setPersonId(id);
    setView("Profile");
    setSelectedId(null);
    setSearch("");
    setMobile(false);
  }
  function create(kind: FormKind, work?: Work) {
    setMobile(false);
    setForm(kind);
    setFormWork(work);
  }
  if (loading)
    return (
      <div className="boot">
        <Logo />
        <Loader2 className="spin" size={22} />
        <p>Finding your team's rhythm…</p>
      </div>
    );
  if (!auth || !state)
    return connection ? (
      <div className="boot">
        <Logo />
        <p>{connection}</p>
        <button className="button" onClick={() => refresh()}>
          Try again
        </button>
      </div>
    ) : (
      <Login onLogin={() => refresh()} />
    );
  const dashboardWork = state.work.filter((w) =>
    overviewScope === "personal"
      ? w.owner_id === state.user.id
      : overviewScope === "team"
        ? state.report_ids.includes(w.owner_id || 0)
        : true,
  );
  const summary = summarizeHealth(dashboardWork);
  const scopePeople = state.employees.filter(
    (p) =>
      p.active &&
      (overviewScope === "personal"
        ? p.id === state.user.id
        : overviewScope === "team"
          ? state.report_ids.includes(p.id)
          : true),
  );
  const me = state.user,
    manager = isManager(me),
    active = (view === "Overview" ? dashboardWork : state.work).filter(
      (w) => w.status !== "Completed",
    ),
    risk = active.filter((w) => ["red", "amber"].includes(w.tone)),
    blocked = active.filter((w) =>
      ["Blocked", "Partially Blocked"].includes(w.status),
    ),
    deps = state.dependencies
      .filter(openDependency)
      .filter(
        (d) =>
          view !== "Overview" ||
          dashboardWork.some((w) => w.id === d.work_item_id),
      ),
    available = (view === "Overview" ? scopePeople : state.employees).filter(
      (p) => p.capacity.confirmed && (p.capacity.available || 0) >= 2,
    ),
    unread = state.notifications.filter((n) => !n.read).length,
    selected = state.work.find((w) => w.id === selectedId),
    coverage = scopePeople.filter((p) =>
      active.some((w) => w.owner_id === p.id && w.commitment_confirmed),
    ).length;
  const filtered = state.work.filter((w) => {
    const project = state.projects.find((p) => p.id === w.project_id),
      owner = state.directory.find((p) => p.id === w.owner_id);
    return (
      (view !== "My work" || w.owner_id === me.id) &&
      (view !== "Overview" || dashboardWork.includes(w)) &&
      (!drillScope ||
        drillScope === "organization" ||
        (drillScope === "personal" && w.owner_id === me.id) ||
        (drillScope === "team" &&
          state.report_ids.includes(w.owner_id || 0))) &&
      (!projectFilter || w.project_id === +projectFilter) &&
      (!teamFilter || project?.team_id === +teamFilter) &&
      (!search ||
        [w.title, project?.name, owner?.name, w.required_skills]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (statusFilter === "all" ||
        (statusFilter === "active" && w.status !== "Completed") ||
        (statusFilter === "attention" && risk.includes(w)) ||
        (statusFilter === "blocked" && blocked.includes(w)) ||
        w.status === statusFilter)
    );
  });
  const displayWorks = view === "Overview" ? filtered.slice(0, 6) : filtered;
  function exportCsv() {
    const rows = [
      [
        "Commitment",
        "Project",
        "Owner",
        "Status",
        "Health",
        "Expected completion",
        "Remaining effort (hours)",
        "Last confirmed",
      ],
      ...filtered.map((w) => [
        w.title,
        state!.projects.find((p) => p.id === w.project_id)?.name || "",
        state!.directory.find((p) => p.id === w.owner_id)?.name || "Unassigned",
        w.status,
        w.health,
        w.due_date,
        String(w.remaining_hours),
        w.confirmed_at || "Unconfirmed",
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              (/^[=+@\-]/.test(v) ? "'" : "") +
              v.replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "teampulse-" + state!.today + ".csv";
    a.click();
    URL.revokeObjectURL(url);
    setToast("Current view exported as CSV.");
  }
  return (
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
        onNavigate={navigate}
        onCreate={create}
        onProject={(id) => {
          navigate("All commitments");
          setProjectFilter(String(id));
        }}
        onAssistant={() => navigate("AI chat")}
        onClose={() => setMobile(false)}
        onLogout={async () => {
          try {
            await api("/auth/logout", {});
            lastUserId.current = null;
            setAuth(false);
            setState(null);
          } catch (e) {
            setToast((e as Error).message);
          }
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
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (
                    [
                      "Profile",
                      "My profile",
                      "My team",
                      "Organization",
                      "Settings",
                    ].includes(view)
                  ) {
                    setView("All commitments");
                    setStatusFilter("all");
                    setDrillScope("");
                  }
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
              onClick={() => setNotices(!notices)}
            >
              <Bell size={19} />
            </button>
            <Avatar person={me} size={31} />
          </div>
        </header>
        <main className={view === "AI chat" ? "chat-page" : ""}>
          <div className="page-heading">
            <div>
              <div className="heading-eyebrow">
                {view === "Overview" ? (
                  <>
                    <Sun size={15} />
                    YOUR TEAM, IN SYNC
                  </>
                ) : (
                  "FLODATA WORKSPACE"
                )}
              </div>
              <h1>
                {view === "Overview"
                  ? `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${me.name.split(" ")[0]}`
                  : ""}
                <span className="greeting-dot">
                  {view === "Overview" ? "." : ""}
                </span>
                {view !== "Overview" &&
                  (view === "Profile"
                    ? state.directory.find((p) => p.id === personId)?.name ||
                      "Individual profile"
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
              {["Overview", "My work", "All commitments"].includes(view) && (
                <button
                  className="button primary"
                  onClick={() => create("work")}
                >
                  <Plus size={16} />
                  New commitment
                </button>
              )}
              {view === "Projects" && manager && (
                <button
                  className="button primary"
                  onClick={() => create("project")}
                >
                  <Plus size={16} />
                  New project
                </button>
              )}
              {view === "Team & capacity" && manager && (
                <button
                  className="button primary"
                  onClick={() => create("employee")}
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
                  onClick={() => setOverviewScope("personal")}
                >
                  <UserRound size={15} />
                  My workspace
                </button>
                {manager && (
                  <button
                    className={overviewScope === "team" ? "active" : ""}
                    onClick={() => setOverviewScope("team")}
                  >
                    <Users size={15} />
                    Reporting team
                  </button>
                )}
                {state.can_manage_org && (
                  <button
                    className={overviewScope === "organization" ? "active" : ""}
                    onClick={() => setOverviewScope("organization")}
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
              <button className="text-button" onClick={() => refresh()}>
                Reconnect
              </button>
            </div>
          )}
          <Dashboard
            view={view}
            summary={summary}
            navigate={navigate}
            active={active}
            dashboardWork={dashboardWork}
            risk={risk}
            blocked={blocked}
            deps={deps}
            available={available}
            setDrillScope={setDrillScope}
            overviewScope={overviewScope}
            me={me}
            filtered={filtered}
            exportCsv={exportCsv}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            teamFilter={teamFilter}
            setTeamFilter={setTeamFilter}
            state={state}
            projectFilter={projectFilter}
            setProjectFilter={setProjectFilter}
            displayWorks={displayWorks}
            setSelectedId={setSelectedId}
            openProfile={openProfile}
            lastSync={lastSync}
            refresh={refresh}
            coverage={coverage}
            scopePeople={scopePeople}
          />

          <ProjectsPage
            view={view}
            state={state}
            search={search}
            navigate={navigate}
            setProjectFilter={setProjectFilter}
            manager={manager}
            create={create}
          />
          <DependenciesPage
            view={view}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            state={state}
            search={search}
            setSelectedId={setSelectedId}
            refresh={refresh}
          />
          <CapacityPage
            view={view}
            state={state}
            search={search}
            openProfile={openProfile}
          />
          <ActivityPage
            view={view}
            state={state}
            search={search}
            setSelectedId={setSelectedId}
          />
          {view === "Settings" && (
            <SettingsView state={state} onDone={refresh} />
          )}
          {view === "My team" && (
            <MyTeam state={state} onProfile={openProfile} />
          )}
          {view === "Organization" && (
            <Organization
              state={state}
              onProfile={openProfile}
              onDone={refresh}
              onAddEmployee={() => create("employee")}
            />
          )}
          {(view === "Profile" || view === "My profile") && (
            <ProfileDashboard
              personId={view === "My profile" ? me.id : (personId ?? me.id)}
              state={state}
              onProfile={openProfile}
              onWork={(w) => setSelectedId(w.id)}
              onDone={refresh}
              onBack={() => navigate(manager ? "My team" : "Overview")}
            />
          )}
          {view === "AI chat" && (
            <ChatWorkspace
              state={state}
              onDone={refresh}
              onWork={(w) => setSelectedId(w.id)}
            />
          )}
          <footer className="page-footer">
            <span>
              <span className="live-dot" />
              Your team's shared source of context
            </span>
            <span>Built for progress, with people in mind.</span>
          </footer>
        </main>
      </div>
      {selected && !form && (
        <WorkDetail
          work={selected}
          state={state}
          onClose={closeDetail}
          onDone={refresh}
          onDependency={() => create("dependency", selected)}
        />
      )}
      {form && (
        <CreateForm
          kind={form}
          state={state}
          work={formWork}
          onClose={closeForm}
          onDone={refresh}
        />
      )}

      {notices && (
        <div className="notification-popover">
          <div className="split">
            <h3>
              Your notifications <span className="count">{unread}</span>
            </h3>
            <button
              className="icon-button"
              aria-label="Close notifications"
              onClick={() => setNotices(false)}
            >
              <X size={17} />
            </button>
          </div>
          {state.notifications.length ? (
            state.notifications.map((n) => (
              <button
                key={n.id}
                className={"notice " + (!n.read ? "unread" : "")}
                onClick={async () => {
                  try {
                    await api("/notifications/" + n.id + "/read", {});
                    await refresh();
                    if (n.update_request_id) navigate("AI chat");
                    else if (n.work_item_id) setSelectedId(n.work_item_id);
                    setNotices(false);
                  } catch (e) {
                    setToast((e as Error).message);
                  }
                }}
              >
                <span className="notice-icon">
                  <Bell size={15} />
                </span>
                <span>
                  {n.message}
                  <small>{ago(n.created_at)}</small>
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
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircleIcon />
          {toast}
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Dismiss message"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
function CheckCircleIcon() {
  return (
    <span className="toast-check">
      <Check size={13} />
    </span>
  );
}
