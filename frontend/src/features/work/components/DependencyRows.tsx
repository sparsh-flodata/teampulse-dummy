import { Link2, Plus, Trash2 } from "lucide-react";
import type { DirectoryPerson } from "@/features/workspace/types";

/** One dependency being drafted in the create form (strings, as form inputs hold them). */
export type DependencyDraft = {
  owner_id: string;
  deliverable: string;
  due_date: string;
  impact: string;
  partial: string;
  effort_hours: string;
};

export const blankDependency = (due: string): DependencyDraft => ({
  owner_id: "",
  deliverable: "",
  due_date: due,
  impact: "High",
  partial: "partial",
  effort_hours: "4",
});

/**
 * "This waits on someone." Each row creates a commitment for that person, which they
 * confirm; when they complete it the dependency is fulfilled and this work unblocks.
 */
export function DependencyRows({
  rows,
  onChange,
  people,
  today,
  due,
}: {
  rows: DependencyDraft[];
  onChange: (rows: DependencyDraft[]) => void;
  people: DirectoryPerson[];
  today: string;
  due: string;
}) {
  const set = (i: number, patch: Partial<DependencyDraft>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <fieldset className="dep-rows">
      <legend>
        <Link2 size={14} />
        Depends on someone
      </legend>
      <p className="form-note">
        Add what this needs from another person. They get their own commitment
        for it to confirm; when they complete it, this stops being blocked.
      </p>
      {rows.map((r, i) => (
        <div className="dep-row" key={i}>
          <label>
            What do you need?
            <input
              value={r.deliverable}
              onChange={(e) => set(i, { deliverable: e.target.value })}
              placeholder="e.g. The final database schema"
              minLength={3}
              maxLength={200}
              required
            />
          </label>
          <div className="form-grid">
            <label>
              From
              <select
                value={r.owner_id}
                onChange={(e) => set(i, { owner_id: e.target.value })}
                required
              >
                <option value="">Choose a person</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Needed by
              <input
                type="date"
                value={r.due_date}
                min={today}
                max={due || undefined}
                onChange={(e) => set(i, { due_date: e.target.value })}
                required
              />
            </label>
            <label>
              Their effort (hours)
              <input
                type="number"
                min={0.5}
                max={1000}
                step={0.5}
                value={r.effort_hours}
                onChange={(e) => set(i, { effort_hours: e.target.value })}
                required
              />
            </label>
            <label>
              Can this work continue?
              <select
                value={r.partial}
                onChange={(e) => set(i, { partial: e.target.value })}
              >
                <option value="partial">Yes, partially blocked</option>
                <option value="full">No, fully blocked</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            className="text-button dep-remove"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            <Trash2 size={13} />
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button small"
        onClick={() => onChange([...rows, blankDependency(due || today)])}
      >
        <Plus size={13} />
        {rows.length ? "Add another dependency" : "Add a dependency"}
      </button>
    </fieldset>
  );
}
