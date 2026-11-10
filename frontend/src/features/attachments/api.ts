import { infiniteQueryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { AttachmentFilters, AttachmentPage } from "./types";

type Cursor = AttachmentPage["next"];

const PAGE_SIZE = 50;

function attachmentsPath(filters: AttachmentFilters, cursor: Cursor) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined) params.set(key, String(value));
  if (cursor) {
    params.set("before", cursor.before);
    params.set("before_id", String(cursor.before_id));
  }
  params.set("limit", String(PAGE_SIZE));
  return "/attachments?" + params.toString();
}

/**
 * Files and links the viewer may see, newest first, one page at a time.
 * Open links carry a short-lived token, so the list refetches on focus and
 * every few minutes to keep them fresh.
 */
export const attachmentsQuery = (filters: AttachmentFilters) =>
  infiniteQueryOptions({
    queryKey: queryKeys.attachments(filters),
    queryFn: ({ pageParam }) =>
      api.get<AttachmentPage>(attachmentsPath(filters, pageParam)),
    initialPageParam: null as Cursor,
    getNextPageParam: (last) => last.next,
    refetchInterval: 5 * 60_000,
  });
