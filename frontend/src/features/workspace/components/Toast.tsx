import { useEffect } from "react";
import { useSelector } from "@tanstack/react-store";
import { Check, X } from "lucide-react";
import { dismissToast, uiStore } from "@/lib/ui-store";

export function Toast() {
  const { toast, toastId } = useSelector(uiStore, (s) => s);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismissToast, 4500);
    return () => clearTimeout(timer);
  }, [toast, toastId]);
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span className="toast-check">
        <Check size={13} />
      </span>
      {toast}
      <button
        className="icon-button"
        onClick={dismissToast}
        aria-label="Dismiss message"
      >
        <X size={14} />
      </button>
    </div>
  );
}
