import { WorkDetail } from "@/features/work/components/WorkDetail";
import { CreateDialog } from "./CreateDialog";
import { useWorkspace } from "../hooks";
import { useModalSearch, useWorkspaceNavigation } from "../navigation";

/**
 * The commitment and create dialogs. They live here, not in the shell, so opening one
 * re-renders only the dialog: the sidebar and the page behind it stay untouched.
 */
export function ModalHost() {
  const { work, create } = useModalSearch();
  const state = useWorkspace();
  const nav = useWorkspaceNavigation();
  const selected = work ? state.work.find((w) => w.id === work) : undefined;
  return (
    <>
      {selected && !create && (
        <WorkDetail
          key={selected.id}
          work={selected}
          state={state}
          onClose={nav.closeWork}
          onDependency={() => nav.openCreate("dependency", selected.id)}
        />
      )}
      {create && (
        <CreateDialog
          kind={create}
          state={state}
          work={create === "dependency" ? selected : undefined}
          onClose={nav.closeCreate}
        />
      )}
    </>
  );
}
