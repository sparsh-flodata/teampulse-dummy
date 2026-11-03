import React from "react";
import { useEffect, useRef } from "react";
import { X, Activity as Pulse, CheckCircle2 } from "lucide-react";
import { Person } from "../lib";

export function Logo() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Pulse size={23} strokeWidth={2.4} />
      </span>
      <span>
        Team<span className="brand-light">Pulse</span>
        <i />
      </span>
    </div>
  );
}

export function Avatar({
  person,
  size = 32,
}: {
  person?: Pick<Person, "name" | "color">;
  size?: number;
}) {
  return (
    <span
      className="avatar"
      style={
        {
          "--avatar-color": person?.color || "#9b9aa8",
          width: size,
          height: size,
          fontSize: size * 0.32,
        } as React.CSSProperties
      }
    >
      {person
        ? person.name
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")
        : "?"}
    </span>
  );
}

export function Badge({ value }: { value: string }) {
  const tone = [
    "Completed",
    "Verified",
    "On track",
    "Available",
    "Approved",
    "Applied",
  ].includes(value)
    ? "green"
    : [
          "Blocked",
          "Overdue",
          "Urgent",
          "Critical",
          "Overloaded",
          "At risk",
          "At Risk",
          "Action needed",
          "Dependency at risk",
        ].includes(value)
      ? "red"
      : [
            "Partially Blocked",
            "Progress unconfirmed",
            "High",
            "Delivered",
            "Awaiting Verification",
            "Needs review",
            "Review dependency",
            "Awaiting verification",
          ].includes(value)
        ? "amber"
        : ["In Progress", "Accepted", "Fully allocated"].includes(value)
          ? "purple"
          : "neutral";
  return (
    <span className={"badge " + tone}>
      <i />
      {value}
    </span>
  );
}

export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span>
        <CheckCircle2 size={27} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,[tabindex="0"]',
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
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
