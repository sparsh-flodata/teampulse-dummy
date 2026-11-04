import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  Loader2,
  Flag,
} from "lucide-react";
import { Avatar, Badge, Empty, FormError, Modal } from "@/components/ui";
import { ago, dateLabel } from "@/lib/format";
import { errorMessage } from "@/lib/forms";
import {
  isManager,
  isProjectParticipant,
  openDependency,
} from "@/features/workspace/domain";
import { useNow, useWorkspaceMutation } from "@/features/workspace/hooks";
import type { Person, Work, WorkspaceState } from "@/features/workspace/types";
import { assignWork, updateWork, workHistoryQuery } from "../api";
import { PRIORITIES, WORK_STATUSES, updateWorkSchema } from "../schemas";
import { DependencyCard } from "./DependencyCard";

export function WorkDetail({
  work,
  state,
  onClose,
  onDependency,
}: {
  work: Work;
  state: WorkspaceState;
  onClose: () => void;
  onDependency: () => void;
}) {
  const [tab, setTab] = useState("Update");
  const [formError, setFormError] = useState("");
  const now = useNow();
  const history = useQuery(workHistoryQuery(work.id));
  const owner = state.directory.find((p) => p.id === work.owner_id),
    project = state.projects.find((p) => p.id === work.project_id),
    own = state.user.id === work.owner_id,
    manager = isManager(state.user),
    deps = state.dependencies.filter((d) => d.work_item_id === work.id);

  const update = useWorkspaceMutation(
    updateWork,
    "Work updated. Your team has the latest context.",
  );
  const assign = useWorkspaceMutation(
    assignWork,
    "Assignment proposed. The employee will confirm feasibility.",
  );
  const busy = update.isPending || assign.isPending;

  const updateForm = useForm({
    defaultValues: {
      status: work.status,
      progress: String(work.progress),
      remaining_hours: String(work.remaining_hours),
      due_date: work.due_date,
      priority: work.priority,
      note: "",
      accept_commitment: false,
    },
    onSubmit: async ({ value }) => {
      setFormError("");
      try {
        const body = updateWorkSchema.parse({
          ...value,
          due_date: own ? value.due_date : undefined,
          priority: manager ? value.priority : undefined,
        });
        await update.mutateAsync({ id: work.id, ...body });
      } catch (e) {
        setFormError(errorMessage(e));
      }
    },
  });

  // Managers and administrators can assign anyone in the organization. People in the
  // viewer's reporting scope come with capacity and skills (ranked first); others are listed
  // by role, and join the project when assigned.
  const detailed = new Map<number, Person>(
    state.employees.map((p) => [p.id, p]),
  );
  const skillScore = (p?: Person) => {
    if (!p) return -1;
    const skill = work.required_skills
      .toLowerCase()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return (
      skill.filter((s) => p.skills.toLowerCase().includes(s)).length * 100 +
      (p.capacity.available || 0)
    );
  };
  const candidates = state.directory
    .filter((p) => p.active && p.id !== work.owner_id)
    .sort(
      (a, b) =>
        skillScore(detailed.get(b.id)) - skillScore(detailed.get(a.id)) ||
        a.name.localeCompare(b.name),
    );
  const onProject = (id: number) =>
    isProjectParticipant(
      state.directory.find((p) => p.id === id)!,
      project,
    );
  const assignForm = useForm({
    defaultValues: { employee_id: String(candidates[0]?.id ?? "") },
    onSubmit: async ({ value }) => {
      setFormError("");
      try {
        await assign.mutateAsync({
          id: work.id,
          employee_id: Number(value.employee_id),
        });
      } catch (e) {
        setFormError(errorMessage(e));
      }
    },
  });

  const error = formError || (history.error ? history.error.message : "");

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
            {work.status !== "Completed" && manager && (
              <form
                className="form assignment-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void assignForm.handleSubmit();
                }}
              >
                <label>
                  {work.owner_id ? "Reassign to" : "Recommend an assignee"}
                  <assignForm.Field name="employee_id">
                    {(field) => (
                      <select
                        name="employee_id"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      >
                        <optgroup label="On this project">
                          {candidates
                            .filter((p) => onProject(p.id))
                            .map((p) => {
                              const d = detailed.get(p.id);
                              return (
                                <option key={p.id} value={p.id}>
                                  {p.name} ·{" "}
                                  {d
                                    ? (d.capacity.confirmed
                                        ? d.capacity.available + "h available"
                                        : "capacity unknown") +
                                      " · " +
                                      d.skills
                                    : p.title}
                                </option>
                              );
                            })}
                        </optgroup>
                        <optgroup label="Elsewhere in the organization (joins the project)">
                          {candidates
                            .filter((p) => !onProject(p.id))
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} · {p.title}
                              </option>
                            ))}
                        </optgroup>
                      </select>
                    )}
                  </assignForm.Field>
                </label>
                <p className="form-note">
                  Suggestions rank skill overlap and confirmed capacity. The new
                  owner must confirm feasibility
                  {work.owner_id ? ", and the current owner is told" : ""}.
                </p>
                <button disabled={busy} className="button primary">
                  {work.owner_id ? "Reassign" : "Propose assignment"}
                  <ArrowRight size={14} />
                </button>
              </form>
            )}
            {work.can_edit && work.owner_id ? (
              <form
                className="form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void updateForm.handleSubmit();
                }}
              >
                <div className="form-grid">
                  <label>
                    Status
                    <updateForm.Field name="status">
                      {(field) => (
                        <select
                          name="status"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                        >
                          {WORK_STATUSES.map((s) => (
                            <option
                              key={s}
                              disabled={s === "Completed" && !own}
                            >
                              {s}
                            </option>
                          ))}
                        </select>
                      )}
                    </updateForm.Field>
                  </label>
                  <label>
                    Progress (%)
                    <updateForm.Field name="progress">
                      {(field) => (
                        <input
                          name="progress"
                          type="number"
                          min={0}
                          max={100}
                          required
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                      )}
                    </updateForm.Field>
                  </label>
                  <label>
                    Remaining effort (hours)
                    <updateForm.Field name="remaining_hours">
                      {(field) => (
                        <input
                          name="remaining_hours"
                          type="number"
                          min={0}
                          max={1000}
                          step={0.5}
                          required
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                      )}
                    </updateForm.Field>
                  </label>
                  <label>
                    Expected completion
                    <updateForm.Field name="due_date">
                      {(field) => (
                        <input
                          name="due_date"
                          type="date"
                          required
                          disabled={!own}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                      )}
                    </updateForm.Field>
                  </label>
                  {manager && (
                    <label>
                      Priority
                      <updateForm.Field name="priority">
                        {(field) => (
                          <select
                            name="priority"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                          >
                            {PRIORITIES.map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        )}
                      </updateForm.Field>
                    </label>
                  )}
                </div>
                <label>
                  What changed?
                  <updateForm.Field name="note">
                    {(field) => (
                      <textarea
                        name="note"
                        placeholder="Share a meaningful update. Include a reason when revising dates or priority."
                        maxLength={4000}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    )}
                  </updateForm.Field>
                </label>
                {own && !work.commitment_confirmed && (
                  <label className="checkbox">
                    <updateForm.Field name="accept_commitment">
                      {(field) => (
                        <input
                          type="checkbox"
                          name="accept"
                          checked={field.state.value}
                          onChange={(e) => field.handleChange(e.target.checked)}
                        />
                      )}
                    </updateForm.Field>
                    I confirm this commitment is feasible.
                  </label>
                )}
                <div className="form-actions">
                  <span className="muted">
                    {work.confirmed_at
                      ? "Last confirmed " + ago(work.confirmed_at, now)
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
            {work.can_edit && (
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
            {(history.data ?? []).map((c) => (
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
                    <small>{ago(a.created_at, now)}</small>
                  </div>
                </div>
              ))}
          </div>
        )}
        <FormError message={error} />
      </div>
    </Modal>
  );
}
