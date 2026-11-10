import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { Badge, Empty, FormError } from "@/components/ui";
import { RichText } from "@/components/ui/RichText";
import { errorMessage } from "@/lib/forms";
import { useWorkspace } from "@/features/workspace/hooks";
import { adminCheckInsQuery } from "../api";

const KIND_LABELS = { daily: "Daily", request: "Request", file: "File" };

/** Admin preview of the check-ins composed for one day, for the dry-run day. */
export function AdminCheckInsPanel() {
  const today = useWorkspace().today;
  const [date, setDate] = useState(today);
  const day = date || today;
  const { data, isPending, error } = useQuery(adminCheckInsQuery(day));
  return (
    <section className="panel checkins-preview">
      <div className="panel-heading">
        <div>
          <h2>
            Check-in preview
            {data && (
              <span className="checkins-mode">
                {!data.enabled ? (
                  <Badge value="Off" tone="neutral" plain />
                ) : data.dry_run ? (
                  <Badge value="Dry run" tone="amber" plain />
                ) : (
                  <Badge value="Live" tone="green" plain />
                )}
              </span>
            )}
          </h2>
          <p>
            What the assistant composed for each person, and whether Google Chat
            delivered it. Administrators only.
          </p>
        </div>
        <label className="checkins-date">
          <span>Day</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <ClipboardList size={20} />
      </div>
      <FormError message={error ? errorMessage(error) : ""} />
      {isPending ? (
        <p className="checkins-loading">Loading check-ins.</p>
      ) : data?.check_ins.length ? (
        <div
          className="checkins-preview-scroll"
          role="region"
          aria-label="Composed check-ins"
          tabIndex={0}
        >
          <table className="work-table checkins-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Items</th>
                <th>Chat delivery</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {data.check_ins.map((c) => (
                <tr key={c.id}>
                  <td>{c.employee_name}</td>
                  <td>{KIND_LABELS[c.kind] ?? c.kind}</td>
                  <td>
                    <Badge value={c.status} />
                    {c.clarify_rounds > 0 && (
                      <div className="subline">
                        {c.clarify_rounds} clarifying question
                        {c.clarify_rounds === 1 ? "" : "s"}
                      </div>
                    )}
                  </td>
                  <td>
                    {c.items.length ? (
                      <ol className="checkins-items">
                        {c.items.map((i) => (
                          <li key={i.n} value={i.n}>
                            {i.title}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <span className="muted">None</span>
                    )}
                  </td>
                  <td>{c.chat_delivery}</td>
                  <td>
                    <details className="checkins-message">
                      <summary>Show message</summary>
                      <RichText text={c.message} />
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : data ? (
        <Empty
          title="No check-ins that day"
          description="Daily check-ins are composed on weekdays at the check-in hour."
        />
      ) : null}
    </section>
  );
}
