import { Activity as Pulse } from "lucide-react";

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
