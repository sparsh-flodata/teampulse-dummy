import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Search, Users } from "lucide-react";
import { Avatar, Empty, Modal } from "@/components/ui";
import type {
  DirectoryPerson,
  WorkspaceState,
} from "@/features/workspace/types";

type Tooltip = {
  person: DirectoryPerson;
  left: number;
  top: number;
  below: boolean;
};

export function ReportingTeam({
  reports,
  state,
  onProfile,
}: {
  reports: DirectoryPerson[];
  state: WorkspaceState;
  onProfile: (id: number) => void;
}) {
  const people = reports.filter((person) => person.active);
  const previewLimit = people.length > 12 ? 11 : 12;
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const tooltipId = useId(),
    searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const dismiss = () => setTooltip(null);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, []);
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);
  if (!people.length) return null;
  const department = (person: DirectoryPerson) =>
    state.teams.find((team) => team.id === person.team_id)?.name ||
    "Team member";
  function show(person: DirectoryPerson, element: HTMLElement) {
    const rect = element.getBoundingClientRect(),
      below = rect.top < 110;
    setTooltip({
      person,
      below,
      left: Math.max(
        12,
        Math.min(rect.left + rect.width / 2 - 110, window.innerWidth - 232),
      ),
      top: below ? rect.bottom + 8 : rect.top - 8,
    });
  }
  function openAll() {
    setQuery("");
    setOpen(true);
    setTooltip(null);
  }
  function navigate(person: DirectoryPerson) {
    setOpen(false);
    setTooltip(null);
    onProfile(person.id);
  }
  const filtered = people.filter((person) =>
    (person.name + " " + person.title + " " + department(person))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <section
        className="panel reporting-team-compact"
        aria-label="Reporting team"
      >
        <div className="reporting-team-heading">
          <h3>
            Reporting team <span>{people.length}</span>
          </h3>
          <button className="button small" onClick={openAll}>
            <Users size={14} />
            View all
          </button>
        </div>
        <p className="reporting-team-hint">
          Direct reports · select an avatar to open a profile
        </p>
        <div className="report-avatar-list">
          {people.slice(0, previewLimit).map((person) => (
            <button
              key={person.id}
              className="report-avatar-button"
              disabled={!person.can_view_profile}
              aria-label={"Open " + person.name + "’s profile"}
              aria-describedby={
                tooltip?.person.id === person.id ? tooltipId : undefined
              }
              title={
                person.name + " · " + person.title + " · " + department(person)
              }
              onMouseEnter={(event) => show(person, event.currentTarget)}
              onMouseLeave={() => setTooltip(null)}
              onFocus={(event) => show(person, event.currentTarget)}
              onBlur={() => setTooltip(null)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setTooltip(null);
              }}
              onClick={() => navigate(person)}
            >
              <Avatar person={person} size={36} />
            </button>
          ))}
          {people.length > previewLimit && (
            <button
              className="report-avatar-more"
              aria-label={"View all " + people.length + " direct reports"}
              onClick={openAll}
            >
              +{people.length - previewLimit}
            </button>
          )}
        </div>
      </section>
      {tooltip &&
        createPortal(
          <div
            className="report-avatar-tooltip"
            id={tooltipId}
            role="tooltip"
            style={{
              left: tooltip.left,
              top: tooltip.top,
              transform: tooltip.below ? undefined : "translateY(-100%)",
            }}
          >
            <strong>{tooltip.person.name}</strong>
            <span>{tooltip.person.title}</span>
            <small>{department(tooltip.person)}</small>
          </div>,
          document.body,
        )}
      {open && (
        <Modal
          title="Reporting team"
          subtitle={
            people.length +
            " direct reports. Search by name, role, or department."
          }
          onClose={() => setOpen(false)}
        >
          <div className="reporting-team-dialog">
            <label className="reporting-team-search">
              <Search size={17} />
              <input
                ref={searchRef}
                aria-label="Search reporting team"
                placeholder="Find a teammate…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="reporting-team-results">
              {filtered.length ? (
                filtered.map((person) => (
                  <button
                    key={person.id}
                    disabled={!person.can_view_profile}
                    onClick={() => navigate(person)}
                  >
                    <Avatar person={person} size={36} />
                    <span>
                      <strong>{person.name}</strong>
                      <small>
                        {department(person)} · {person.title}
                      </small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                ))
              ) : (
                <Empty
                  title="No matching teammates"
                  description="Try another name or department."
                />
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
