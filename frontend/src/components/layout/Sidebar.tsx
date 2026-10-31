import {
  Activity,
  LayoutDashboard,
  CheckSquare,
  UserRound,
  Users,
  GitBranch,
  Target,
  FolderKanban,
  Link2,
  History,
  Sparkles,
  Settings,
  LogOut,
  X,
  ChevronDown,
  Plus,
} from "lucide-react";
import type { RefObject } from "react";
import { State, View, Work, isManager, openDependency } from "../../lib";
import { Logo, Avatar } from "../ui";
import type { FormKind } from "../../features/work/CreateForm";
const items: { label: View; icon: typeof Activity }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "AI chat", icon: Sparkles },
  { label: "My work", icon: CheckSquare },
  { label: "My profile", icon: UserRound },
  { label: "My team", icon: Users },
  { label: "Organization", icon: GitBranch },
  { label: "All commitments", icon: Target },
  { label: "Projects", icon: FolderKanban },
  { label: "Dependencies", icon: Link2 },
  { label: "Team & capacity", icon: Users },
  { label: "Activity", icon: History },
];
type Props = {
  state: State;
  view: View;
  mobile: boolean;
  smallScreen: boolean;
  sidebarRef: RefObject<HTMLElement | null>;
  onNavigate: (view: View) => void;
  onCreate: (kind: FormKind, work?: Work) => void;
  onProject: (id: number) => void;
  onAssistant: () => void;
  onClose: () => void;
  onLogout: () => Promise<void>;
};
export function Sidebar({
  state,
  view,
  mobile,
  smallScreen,
  sidebarRef,
  onNavigate,
  onCreate,
  onProject,
  onClose,
  onLogout,
}: Props) {
  const manager = isManager(state.user),
    myWork = state.work.filter(
      (w) => w.owner_id === state.user.id && w.status !== "Completed",
    ).length;
  return (
    <aside
      ref={sidebarRef}
      inert={smallScreen && !mobile}
      aria-hidden={smallScreen && !mobile}
      role={smallScreen && mobile ? "dialog" : undefined}
      aria-modal={smallScreen && mobile ? true : undefined}
      aria-label="Workspace navigation"
      className={"sidebar " + (mobile ? "mobile-open" : "")}
    >
      <div className="sidebar-header">
        {smallScreen && (
          <button
            className="icon-button close-navigation"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        )}
        <Logo />
        <div className="workspace-switch">
          <div className="workspace-avatar">
            F<span />
          </div>
          <div>
            <strong>FloData Analytics</strong>
            <small>Sample team workspace</small>
          </div>
          <ChevronDown size={15} />
        </div>
      </div>
      <div
        className="sidebar-scroll"
        tabIndex={0}
        aria-label="Scrollable workspace navigation"
      >
        <div className="sidebar-label">WORKSPACE</div>
        <nav>
          {items
            .filter((i) => i.label !== "My team" || manager)
            .map(({ label, icon: Icon }) => (
              <button
                key={label}
                className={view === label ? "active" : ""}
                onClick={() => onNavigate(label)}
              >
                <Icon size={18} />
                <span>{label}</span>
                {label === "My work" && <small>{myWork}</small>}
                {label === "Dependencies" &&
                  state.dependencies.filter(openDependency).length > 0 && (
                    <b>{state.dependencies.filter(openDependency).length}</b>
                  )}
                {label === "AI chat" && <span className="nav-new">NEW</span>}
              </button>
            ))}
        </nav>
        <div className="sidebar-projects">
          <div className="split sidebar-label">
            <span>PROJECTS</span>
            {manager && (
              <button
                className="icon-button"
                aria-label="Create project"
                onClick={() => onCreate("project")}
              >
                <Plus size={14} />
              </button>
            )}
          </div>
          {state.projects.map((p) => (
            <button title={p.name} key={p.id} onClick={() => onProject(p.id)}>
              <span className="project-dot" style={{ background: p.color }} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
        <div className="nav-scroll-end">
          A shared picture. A little more clarity.
        </div>
      </div>
      <div className="sidebar-footer">
        <button
          className={"settings-link " + (view === "Settings" ? "active" : "")}
          onClick={() => onNavigate("Settings")}
        >
          <Settings size={17} />
          Settings
        </button>
        <div className="sidebar-user">
          <Avatar person={state.user} size={34} />
          <div>
            <strong title={state.user.name}>{state.user.name}</strong>
            <small>
              {state.user.role === "admin"
                ? "Employer / administrator"
                : manager
                  ? "Reporting manager"
                  : "Team member"}
            </small>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={onLogout}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
