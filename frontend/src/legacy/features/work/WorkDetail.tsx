import React from "react";
import { useState, useEffect, FormEvent } from "react";
import {
  Plus,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  Loader2,
  Flag,
} from "lucide-react";
import { Avatar, Badge, Empty, Modal } from "../../components/ui";
import { DependencyCard } from "./DependencyCard";
import {
  api,
  State,
  Person,
  Work,
  dateLabel,
  ago,
  isManager,
  openDependency,
  isProjectParticipant,
} from "../../lib";

export function WorkDetail({
  work,
  state,
  onClose,
  onDone,
  onDependency,
}: {
  work: Work;
  state: State;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
  onDependency: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [history, setHistory] = useState<
      { revision: number; due_date: string; reason: string }[]
    >([]),
    [tab, setTab] = useState("Update");
  const owner = state.directory.find((p) => p.id === work.owner_id),
    project = state.projects.find((p) => p.id === work.project_id),
    own = state.user.id === work.owner_id,
    canEdit = work.can_edit,
    deps = state.dependencies.filter((d) => d.work_item_id === work.id);
  useEffect(() => {
    api<typeof history>("/work/" + work.id + "/history")
      .then(setHistory)
      .catch((e) => setError(e.message));
  }, [work.id, work.revision]);
  async function update(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      status: f.get("status"),
      progress: Number(f.get("progress")),
      remaining_hours: Number(f.get("remaining_hours")),
      note: String(f.get("note") || ""),
      accept_commitment: f.get("accept") === "on",
    };
    if (own) body.due_date = f.get("due_date");
    if (isManager(state.user)) body.priority = f.get("priority");
    try {
      await api("/work/" + work.id, body, "PATCH");
      await onDone("Work updated. Your team has the latest context.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function assign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/work/" + work.id + "/assign", {
        employee_id: Number(new FormData(e.currentTarget).get("employee_id")),
      });
      await onDone(
        "Assignment proposed. The employee will confirm feasibility.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={work.title}
      subtitle={project?.name + " · TP-" + String(work.id).padStart(3, "0")}
      onClose={onClose}
      wide
    >
      <div className="detail-body">
        <div className="detail-summary">
          <div className="person-inline">
            <Avatar person={owner} />
            <span>
              {owner?.name || "Unassigned"}
              <small>{owner?.title || "Ready for a suitable teammate"}</small>
            </span>
          </div>
          <Badge value={work.status} />
          <Badge value={work.health} />
        </div>
        <div className={"health-explanation tone-" + work.tone}>
          <strong>{work.health}</strong>
          <p>{work.health_reason}</p>
          <span>{work.next_action}</span>
        </div>
        <p className="detail-description">
          {work.description || "No additional scope recorded."}
        </p>
        <div className="detail-metrics">
          <div>
            <CalendarDays size={17} />
            <small>Expected completion</small>
            <strong>{dateLabel(work.due_date, state.today)}</strong>
          </div>
          <div>
            <Clock3 size={17} />
            <small>Effort / remaining</small>
            <strong>
              {work.effort_hours}h / {work.remaining_hours}h
            </strong>
          </div>
          <div>
            <Flag size={17} />
            <small>Priority</small>
            <strong>{work.priority}</strong>
          </div>
        </div>
        <div className="tabs">
          {["Update", "Dependencies", "History"].map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t}
              {t === "Dependencies" && (
                <span>{deps.filter(openDependency).length}</span>
              )}
            </button>
          ))}
        </div>
        {tab === "Update" && (
          <>
            {!work.owner_id && isManager(state.user) && (
              <form className="form assignment-form" onSubmit={assign}>
                <label>
                  Recommend an owner
                  <select name="employee_id">
                    {state.employees
                      .filter((p) => isProjectParticipant(p, project))
                      .sort((a, b) => {
                        const skill = work.required_skills
                          .toLowerCase()
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean);
                        const score = (p: Person) =>
                          skill.filter((s) =>
                            p.skills.toLowerCase().includes(s),
                          ).length *
                            100 +
                          (p.capacity.available || 0);
                        return score(b) - score(a);
                      })
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ·{" "}
                          {p.capacity.confirmed
                            ? p.capacity.available + "h available"
                            : "capacity unknown"}{" "}
                          · {p.skills}
                        </option>
                      ))}
                  </select>
                </label>
                <p className="form-note">
                  Suggestions rank skill overlap and confirmed capacity. The
                  employee must confirm feasibility.
                </p>
                <button disabled={busy} className="button primary">
                  Propose assignment
                  <ArrowRight size={14} />
                </button>
              </form>
            )}
            {canEdit && work.owner_id ? (
              <form key={work.id} className="form" onSubmit={update}>
                <div className="form-grid">
                  <label>
                    Status
                    <select name="status" defaultValue={work.status}>
                      {[
                        "Planned",
                        "In Progress",
                        "Partially Blocked",
                        "Blocked",
                        "Awaiting Verification",
                        "Completed",
                      ].map((s) => (
                        <option key={s} disabled={s === "Completed" && !own}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Progress (%)
                    <input
                      name="progress"
                      type="number"
                      min={0}
                      max={100}
                      required
                      defaultValue={work.progress}
                    />
                  </label>
                  <label>
                    Remaining effort (hours)
                    <input
                      name="remaining_hours"
                      type="number"
                      min={0}
                      max={1000}
                      step={0.5}
                      defaultValue={work.remaining_hours}
                      required
                    />
                  </label>
                  <label>
                    Expected completion
                    <input
                      name="due_date"
                      type="date"
                      required
                      defaultValue={work.due_date}
                      disabled={!own}
                    />
                  </label>
                  {isManager(state.user) && (
                    <label>
                      Priority
                      <select name="priority" defaultValue={work.priority}>
                        {["Low", "Medium", "High", "Urgent"].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <label>
                  What changed?
                  <textarea
                    name="note"
                    placeholder="Share a meaningful update. Include a reason when revising dates or priority."
                    maxLength={4000}
                  />
                </label>
                {own && !work.commitment_confirmed && (
                  <label className="checkbox">
                    <input type="checkbox" name="accept" />I confirm this
                    commitment is feasible.
                  </label>
                )}
                <div className="form-actions">
                  <span className="muted">
                    {work.confirmed_at
                      ? "Last confirmed " + ago(work.confirmed_at)
                      : "Progress has not been confirmed"}
                  </span>
                  <button className="button primary" disabled={busy}>
                    {busy ? (
                      <Loader2 size={15} className="spin" />
                    ) : (
                      <Check size={15} />
                    )}
                    Save update
                  </button>
                </div>
              </form>
            ) : (
              work.owner_id && (
                <p className="form-note">
                  You can view this shared commitment. Its owner provides work
                  updates.
                </p>
              )
            )}
          </>
        )}
        {tab === "Dependencies" && (
          <div className="detail-dependencies">
            {canEdit && (
              <button className="button" onClick={onDependency}>
                <Plus size={15} />
                Add dependency
              </button>
            )}
            {deps.length ? (
              deps.map((d) => (
                <DependencyCard
                  key={d.id}
                  dep={d}
                  state={state}
                  onWork={() => {}}
                  onRefresh={onDone}
                />
              ))
            ) : (
              <Empty
                title="Nothing in the way"
                description="Capture a dependency when you need a deliverable from someone else."
              />
            )}
          </div>
        )}
        {tab === "History" && (
          <div className="history-list">
            <h4>Commitment revisions</h4>
            {history.map((c) => (
              <div className="history-event" key={c.revision}>
                <span className="history-point" />
                <div>
                  <strong>
                    Revision {c.revision} · expected {dateLabel(c.due_date)}
                  </strong>
                  <p>{c.reason}</p>
                </div>
              </div>
            ))}
            <h4>Work activity</h4>
            {state.activity
              .filter((a) => a.work_item_id === work.id)
              .map((a) => (
                <div className="history-event" key={a.id}>
                  <Avatar
                    person={state.employees.find((p) => p.id === a.actor_id)}
                    size={25}
                  />
                  <div>
                    <p>{a.message}</p>
                    <small>{ago(a.created_at)}</small>
                  </div>
                </div>
              ))}
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
