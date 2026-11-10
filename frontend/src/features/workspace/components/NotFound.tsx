import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Empty } from "@/components/ui";

/** Unknown URL or invalid id. Uses the existing panel + empty-state styles. */
export function NotFound() {
  return (
    <section className="panel">
      <Empty
        title="There's nothing here"
        description="This link may be out of date. Your workspace is one step away."
        action={
          <Link to="/" className="button">
            <ArrowLeft size={14} />
            Back to workspace
          </Link>
        }
      />
    </section>
  );
}
