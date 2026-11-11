import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown } from "lucide-react";

export type FilterOption = {
  id: number;
  label: string;
  /** A short note on the right, such as a count. */
  hint?: string;
  /** A colour dot (projects). */
  color?: string;
};

/**
 * A filter that takes several values: a button that opens a checklist. Choosing
 * more than one value shows work that matches any of them. Escape or a click
 * outside closes it.
 */
export function MultiFilter({
  label,
  icon,
  options,
  selected,
  onChange,
}: {
  label: string;
  icon?: ReactNode;
  options: FilterOption[];
  selected: number[];
  onChange: (next: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const toggle = (id: number) =>
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );

  return (
    <div className="multi-filter" ref={root}>
      <button
        ref={trigger}
        type="button"
        className={
          "multi-filter-trigger" + (selected.length ? " has-value" : "")
        }
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
      >
        {icon}
        <span>{label}</span>
        {selected.length > 0 && (
          <span className="multi-filter-count">{selected.length}</span>
        )}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            className="multi-filter-menu"
            role="group"
            aria-label={label}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            <div className="multi-filter-options">
              {options.map((o) => {
                const on = selected.includes(o.id);
                return (
                  <label
                    key={o.id}
                    className={"multi-filter-option" + (on ? " is-on" : "")}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(o.id)}
                    />
                    <span className="multi-filter-box" aria-hidden="true">
                      {on && <Check size={12} strokeWidth={3} />}
                    </span>
                    {o.color && (
                      <span
                        className="multi-filter-dot"
                        style={{ background: o.color }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="multi-filter-label">{o.label}</span>
                    {o.hint && <small>{o.hint}</small>}
                  </label>
                );
              })}
            </div>
            {selected.length > 0 && (
              <button
                type="button"
                className="text-button multi-filter-clear"
                onClick={() => onChange([])}
              >
                Clear {label.toLowerCase()}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
