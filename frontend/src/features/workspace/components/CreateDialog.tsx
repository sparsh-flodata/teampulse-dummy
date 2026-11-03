import type { FormEvent, ReactNode } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { FormError, Modal } from "@/components/ui";
import { AddTeammateForm } from "@/features/organization/components/AddTeammateForm";
import { CreateProjectForm } from "@/features/projects/components/CreateProjectForm";
import { CreateDependencyForm } from "@/features/work/components/CreateDependencyForm";
import { CreateWorkForm } from "@/features/work/components/CreateWorkForm";
import type { FormKind } from "../navigation";
import type { Work, WorkspaceState } from "../types";

const titles: Record<FormKind, string> = {
  work: "A new commitment",
  project: "Create a project",
  employee: "Welcome a teammate",
  dependency: "Make a dependency visible",
};

/** The "create" modal opened via ?create=<kind>. */
export function CreateDialog({
  kind,
  state,
  work,
  onClose,
}: {
  kind: FormKind;
  state: WorkspaceState;
  work?: Work;
  onClose: () => void;
}) {
  const props = { state, onClose };
  return (
    <Modal
      title={titles[kind]}
      subtitle={
        kind === "dependency"
          ? "Capture what is needed, who owns it, and what can continue."
          : "Make the next step clear. You can refine it as work evolves."
      }
      onClose={onClose}
    >
      {kind === "work" && <CreateWorkForm {...props} />}
      {kind === "project" && <CreateProjectForm {...props} />}
      {kind === "employee" && <AddTeammateForm {...props} />}
      {kind === "dependency" && work && (
        <CreateDependencyForm {...props} work={work} />
      )}
    </Modal>
  );
}

/** Shared form frame: error line plus Cancel / submit actions. */
export function CreateFormFrame({
  onSubmit,
  onClose,
  busy,
  error,
  submitLabel,
  children,
}: {
  onSubmit: () => void;
  onClose: () => void;
  busy: boolean;
  error: string;
  submitLabel: string;
  children: ReactNode;
}) {
  return (
    <form
      className="form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
      <FormError message={error} icon={<AlertCircle size={16} />} />
      <div className="form-actions">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button className="button primary" disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />}{" "}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
