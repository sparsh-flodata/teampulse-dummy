import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api/client";
import { optionalNumberField } from "@/lib/forms";
import { queryKeys } from "@/lib/api/query-keys";
import type {
  AgentAction,
  ChatMessage,
  UpdateRequest,
} from "@/features/workspace/types";

export const updateRequestsQuery = queryOptions({
  queryKey: queryKeys.updateRequests,
  queryFn: () => api.get<UpdateRequest[]>("/update-requests"),
  refetchInterval: 15_000,
  refetchIntervalInBackground: false,
});

export const assistantHistoryQuery = queryOptions({
  queryKey: queryKeys.assistantHistory,
  queryFn: () =>
    api.get<{ messages: ChatMessage[]; actions: AgentAction[] }>(
      "/assistant/history",
    ),
});

export type ChatResult = {
  reply: string;
  action: AgentAction | null;
  auto_applied?: boolean;
};

export const sendChat = (body: {
  message: string;
  work_item_id: number | null;
  recipient_ids: number[];
  request_id: string;
}) => api.post<ChatResult>("/assistant/chat", body);

export const decideAction = (vars: { id: number; approve: boolean }) =>
  api.post<{ status: string; requests?: UpdateRequest[] }>(
    `/assistant/actions/${vars.id}/decide`,
    { approve: vars.approve },
  );

export const cancelUpdateRequest = (id: number) =>
  api.post(`/update-requests/${id}/cancel`);

export const replySchema = z.object({
  message: z.string().trim().min(3, "Write at least 3 characters.").max(4000),
  work_item_id: z.string().transform((v) => (v ? Number(v) : null)),
  progress: optionalNumberField(0, 100, "Progress"),
  remaining_hours: optionalNumberField(0, 1000, "Hours remaining"),
  status: z.string().transform((v) => v || null),
});
export type ReplyInput = z.output<typeof replySchema>;

export const replyToUpdateRequest = ({
  id,
  ...body
}: ReplyInput & { id: number }) =>
  api.post(`/update-requests/${id}/reply`, body);
