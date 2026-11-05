import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Empty } from "@/components/ui";
import { attachmentsQuery } from "../api";
import type { AttachmentFilters } from "../types";
import { AttachmentList } from "./AttachmentList";

// Together: "No files or links yet. When someone sends one with an update, it shows up here."
export const EMPTY_TITLE = "No files or links yet.";
export const EMPTY_TEXT =
  "When someone sends one with an update, it shows up here.";

/**
 * Loads files and links for a set of filters and shows them with "Load more".
 * The caller provides the container (a panel, or a tab body inside a modal).
 */
export function AttachmentFeed({
  filters,
  onWork,
  showWork,
  showProject,
  search = "",
}: {
  filters: AttachmentFilters;
  onWork?: (id: number) => void;
  showWork?: boolean;
  showProject?: boolean;
  /** Narrows the loaded rows by file name (the page's search box). */
  search?: string;
}) {
  const query = useInfiniteQuery(attachmentsQuery(filters));
  if (query.isPending)
    return (
      <div className="att-loading" aria-busy="true">
        <Loader2 size={18} className="spin" />
        <span>Loading files and links…</span>
      </div>
    );
  if (query.isError)
    return (
      <Empty
        title="Files and links aren't available"
        description={query.error.message}
        action={
          <button className="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        }
      />
    );

  const needle = search.trim().toLowerCase();
  const all = query.data.pages.flatMap((p) => p.items);
  const items = needle
    ? all.filter((a) =>
        (a.name + " " + a.note + " " + a.work_title)
          .toLowerCase()
          .includes(needle),
      )
    : all;

  return (
    <div className="att-feed">
      {items.length ? (
        <AttachmentList
          items={items}
          onWork={onWork}
          showWork={showWork}
          showProject={showProject}
        />
      ) : (
        <Empty
          title={needle && all.length ? "No matches" : EMPTY_TITLE}
          description={
            needle && all.length
              ? "No loaded file or link matches your search."
              : EMPTY_TEXT
          }
        />
      )}
      {query.hasNextPage && (
        <div className="att-more">
          <button
            className="button"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage && <Loader2 size={14} className="spin" />}
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
