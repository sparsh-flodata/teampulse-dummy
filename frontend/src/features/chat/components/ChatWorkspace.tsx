import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  Send,
  Plus,
  X,
  Check,
  ArrowUpRight,
  MessageSquare,
  Inbox,
  CheckCircle2,
  Loader2,
  Link2,
  AlertCircle,
} from "lucide-react";
import { Avatar, Empty, FormError } from "@/components/ui";
import { ago } from "@/lib/format";
import { errorMessage } from "@/lib/forms";
import { isManager } from "@/features/workspace/domain";
import {
  useNow,
  useWorkspace,
  useWorkspaceMutation,
} from "@/features/workspace/hooks";
import { useWorkspaceNavigation } from "@/features/workspace/navigation";
import type { UpdateRequest } from "@/features/workspace/types";
import {
  assistantHistoryQuery,
  cancelUpdateRequest,
  decideAction,
  sendChat,
  updateRequestsQuery,
} from "../api";
import { useChatViewport } from "../hooks/useChatViewport";
import { ProposalCard } from "./ProposalCard";
import { UpdateReplyDialog } from "./UpdateReplyDialog";

type RequestTab = "Requested" | "My inbox";
type Pane = "Chat" | "Updates";

const managerSuggestions = [
  {
    title: "Collect team updates",
    description: "Ask your reporting team for progress and blockers.",
    message: "Ask my team for updates",
  },
  {
    title: "See what needs attention",
    description: "Find recorded blockers across your reporting scope.",
    message: "Who is blocked?",
  },
  {
    title: "Review my commitments",
    description: "Get a clear picture of your own plan.",
    message: "Summarize my commitments",
  },
];
const employeeSuggestions = [
  {
    title: "Review my commitments",
    description: "See your current plan and priorities.",
    message: "Summarize my commitments",
  },
  {
    title: "Review recorded blockers",
    description: "Understand what is preventing progress.",
    message: "Who is blocked?",
  },
];

export function ChatWorkspace() {
  const state = useWorkspace();
  const nav = useWorkspaceNavigation();
  const now = useNow();
  const chatRoot = useChatViewport();
  const manager = isManager(state.user);
  const history = useQuery(assistantHistoryQuery);
  const requestsQuery = useQuery(updateRequestsQuery);
  const requests = requestsQuery.data ?? [];

  const [text, setText] = useState(""),
    [context, setContext] = useState(""),
    [recipients, setRecipients] = useState<number[]>([]),
    [picker, setPicker] = useState(false),
    [peopleSearch, setPeopleSearch] = useState(""),
    [error, setError] = useState(""),
    [chosenTab, setRequestTab] = useState<RequestTab | null>(null),
    [chosenPane, setMobilePane] = useState<Pane | null>(null),
    [reply, setReply] = useState<UpdateRequest | null>(null);
  const transcript = useRef<HTMLDivElement>(null),
    pending = useRef<{ signature: string; id: string } | null>(null);

  const send = useWorkspaceMutation(sendChat, (r) =>
    r.auto_applied ? "Progress saved to your work profile." : "",
  );
  const decide = useWorkspaceMutation(decideAction, (r, vars) =>
    r.requests?.length
      ? r.requests.some((x) => x.status === "Delivered")
        ? "Update requests delivered to TeamPulse inboxes."
        : "Those people already have an open request from you."
      : vars.approve
        ? "Confirmed and saved."
        : "Proposal dismissed.",
  );
  const cancel = useWorkspaceMutation(
    cancelUpdateRequest,
    "Update request cancelled.",
  );
  const busy = send.isPending || decide.isPending || cancel.isPending;

  // Until the user picks, open on the inbox when someone is waiting for a reply.
  const awaitingReply = requests.some(
    (r) => r.recipient_id === state.user.id && r.can_reply,
  );
  const requestTab: RequestTab =
    chosenTab ?? (awaitingReply || !manager ? "My inbox" : "Requested");
  const mobilePane: Pane = chosenPane ?? (awaitingReply ? "Updates" : "Chat");

  const messages = [
    ...(history.data?.messages ?? []),
    ...(send.isPending && send.variables
      ? [{ role: "user", message: send.variables.message }]
      : []),
  ];
  const actions = history.data?.actions ?? [];

  const candidates = state.directory.filter(
    (p) =>
      p.active && p.id !== state.user.id && state.profile_ids.includes(p.id),
  );
  const ownWork = state.work.filter(
    (w) => w.owner_id === state.user.id && w.status !== "Completed",
  );

  useEffect(() => {
    const node = transcript.current;
    if (node)
      node.scrollTo({
        top: node.scrollHeight,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
  }, [messages.length, actions.length, busy]);

  async function submit(message = text, selected = recipients) {
    if (!message.trim() || busy) return;
    setError("");
    setText("");
    setPicker(false);
    // Retries of the same message reuse its id so the server can deduplicate.
    const signature = JSON.stringify([message, context, selected]);
    if (pending.current?.signature !== signature)
      pending.current = { signature, id: crypto.randomUUID() };
    try {
      await send.mutateAsync({
        message,
        work_item_id: context ? Number(context) : null,
        recipient_ids: selected,
        request_id: pending.current.id,
      });
      pending.current = null;
      setRecipients([]);
    } catch (e) {
      setError(errorMessage(e));
      setText(message);
    }
  }

  async function onDecide(id: number, approve: boolean) {
    setError("");
    try {
      const r = await decide.mutateAsync({ id, approve });
      if (r.requests?.length) setRequestTab("Requested");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function addPerson(id: number) {
    setRecipients((old) => (old.includes(id) ? old : [...old, id]));
    setPicker(false);
    setPeopleSearch("");
  }

  const inbox = requests.filter((r) => r.recipient_id === state.user.id),
    outgoing = requests.filter((r) => r.requester_id === state.user.id),
    shown = requestTab === "My inbox" ? inbox : outgoing;
  const shownError =
    error ||
    (history.error ? history.error.message : "") ||
    (requestsQuery.error ? requestsQuery.error.message : "");

  return (
    <div
      ref={chatRoot}
      className={"chat-workspace mobile-pane-" + mobilePane.toLowerCase()}
    >
      <div
        className="chat-mobile-tabs"
        role="tablist"
        aria-label="Chat workspace panels"
      >
        <button
          className={mobilePane === "Chat" ? "active" : ""}
          role="tab"
          aria-selected={mobilePane === "Chat"}
          aria-controls="pulse-conversation"
          onClick={() => setMobilePane("Chat")}
        >
          <MessageSquare size={14} />
          Chat
        </button>
        <button
          className={mobilePane === "Updates" ? "active" : ""}
          role="tab"
          aria-selected={mobilePane === "Updates"}
          aria-controls="pulse-updates"
          onClick={() => setMobilePane("Updates")}
        >
          <Inbox size={14} />
          Updates<span>{inbox.filter((r) => r.can_reply).length}</span>
        </button>
      </div>
      <section
        className="coord-chat panel"
        id="pulse-conversation"
        aria-label="Pulse conversation"
      >
        <header className="coord-chat-header">
          <span className="chat-pulse-logo">
            <Sparkles size={22} />
          </span>
          <div>
            <h2>Pulse workspace</h2>
            <p>
              <i className={state.assistant_connected ? "connected" : ""} />
              {state.assistant_connected
                ? "AI provider connected"
                : "Structured assistant · model provider not connected"}
            </p>
          </div>
          <span className="chat-channel">
            <Link2 size={12} />
            TeamPulse inbox
          </span>
        </header>
        <div className="chat-context-bar">
          <label htmlFor="chat-work-context">Work context</label>
          <select
            id="chat-work-context"
            aria-label="Work context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
          >
            <option value="">My plan & team</option>
            {ownWork.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
          </select>
          <div className="people-picker-wrap">
            <button
              className="add-people-button"
              aria-expanded={picker}
              aria-controls="chat-people-picker"
              onClick={() => setPicker(!picker)}
            >
              <Plus size={13} />
              Add people
            </button>
            {picker && (
              <div className="people-picker" id="chat-people-picker">
                <div className="split">
                  <strong>Mention a teammate</strong>
                  <button
                    className="icon-button"
                    aria-label="Close people picker"
                    onClick={() => setPicker(false)}
                  >
                    <X size={15} />
                  </button>
                </div>
                <input
                  autoFocus
                  aria-label="Find teammate to mention"
                  placeholder="Search your reporting team…"
                  value={peopleSearch}
                  onChange={(e) => setPeopleSearch(e.target.value)}
                />
                <div className="people-picker-list">
                  {candidates
                    .filter((p) =>
                      (p.name + " " + p.title)
                        .toLowerCase()
                        .includes(peopleSearch.toLowerCase()),
                    )
                    .map((p) => (
                      <button key={p.id} onClick={() => addPerson(p.id)}>
                        <Avatar person={p} size={28} />
                        <span>
                          {p.name}
                          <small>{p.title}</small>
                        </span>
                        {recipients.includes(p.id) ? (
                          <Check size={14} />
                        ) : (
                          <Plus size={13} />
                        )}
                      </button>
                    ))}
                  {!candidates.length && (
                    <p>
                      Your reporting permissions do not include other employees.
                      You can still manage your own work.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        {recipients.length > 0 && (
          <div className="mention-chips">
            {recipients.map((id) => {
              const p = state.directory.find((p) => p.id === id);
              return (
                <span key={id}>
                  <Avatar person={p} size={20} />@{p?.name}
                  <button
                    aria-label={"Remove " + p?.name}
                    onClick={() =>
                      setRecipients((old) => old.filter((i) => i !== id))
                    }
                  >
                    <X size={11} />
                  </button>
                </span>
              );
            })}
            <button
              className="text-button"
              onClick={() =>
                setText(
                  "Ask " +
                    recipients
                      .map(
                        (id) =>
                          "@" + state.directory.find((p) => p.id === id)?.name,
                      )
                      .join(" and ") +
                    " for an update on current work",
                )
              }
            >
              Draft update request
              <ArrowUpRight size={12} />
            </button>
          </div>
        )}
        <div className="coord-transcript" ref={transcript}>
          {messages.length === 0 && (
            <div className="coord-welcome">
              <span>
                <Sparkles size={30} />
              </span>
              <span className="eyebrow">
                A clearer picture, one conversation at a time
              </span>
              <h2>What should we move forward?</h2>
              <p>
                Plan your work, ask about your team, or request an update from
                someone you mention.
              </p>
              <div className="chat-suggestions">
                {(manager ? managerSuggestions : employeeSuggestions).map(
                  (s) => (
                    <button
                      key={s.title}
                      onClick={() => void submit(s.message, [])}
                    >
                      <strong>
                        {s.title}
                        <ArrowUpRight size={15} />
                      </strong>
                      <p>{s.description}</p>
                    </button>
                  ),
                )}
              </div>
              <p className="chat-example">
                Try: “Ask Ankita Kushwaha for an update about this week’s
                priorities.”
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <div className={"coord-message " + m.role} key={i}>
              {m.role === "assistant" ? (
                <span className="coord-author">
                  <Sparkles size={13} />
                  Pulse assistant
                  {m.agent && <span className="coord-agent">{m.agent}</span>}
                </span>
              ) : (
                <span className="coord-author">
                  <Avatar person={state.user} size={20} />
                  {state.user.name.split(" ")[0]}
                </span>
              )}
              <p>{m.message}</p>
            </div>
          ))}
          {actions
            .filter((a) => a.status === "Proposed")
            .map((a) => (
              <ProposalCard
                key={a.id}
                action={a}
                state={state}
                busy={busy}
                decide={(approve) => void onDecide(a.id, approve)}
              />
            ))}
          {busy && (
            <div className="chat-loading">
              <span />
              <span />
              <span />
            </div>
          )}
          <FormError message={shownError} icon={<AlertCircle size={15} />} />
        </div>
        <div className="coord-composer-wrap">
          <form
            className="coord-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <textarea
              aria-label="Message Pulse"
              placeholder="Give an instruction or mention someone by name…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={4000}
              rows={2}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing &&
                  window.matchMedia("(min-width: 761px)").matches
                ) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <div>
              <span>Shift + Enter for a new line</span>
              <button
                disabled={busy || !text.trim()}
                aria-label="Send instruction"
              >
                {busy ? (
                  <Loader2 size={17} className="spin" />
                ) : (
                  <Send size={17} />
                )}
              </button>
            </div>
          </form>
          <p className="coord-composer-note">
            <CheckCircle2 size={12} />
            Requests respect your reporting permissions and reach people in
            TeamPulse and, once they connect it, Google Chat.
          </p>
        </div>
      </section>
      <aside
        className="coord-updates panel"
        id="pulse-updates"
        aria-label="Update center"
      >
        <header>
          <span className="updates-symbol">
            <Inbox size={18} />
          </span>
          <div>
            <h3>Update center</h3>
            <p>Requests, replies, and next steps.</p>
          </div>
        </header>
        <div className="updates-tabs">
          {(["Requested", "My inbox"] as const).map((t) => (
            <button
              key={t}
              className={requestTab === t ? "active" : ""}
              onClick={() => setRequestTab(t)}
            >
              {t}
              <span>
                {t === "My inbox"
                  ? inbox.filter((r) => r.can_reply).length
                  : outgoing.filter((r) =>
                      ["Queued", "Delivered"].includes(r.status),
                    ).length}
              </span>
            </button>
          ))}
        </div>
        <div className="update-request-list">
          {shown.length ? (
            shown.map((r) => (
              <article
                className={
                  "update-request-card " +
                  (r.status === "Responded" ? "answered" : "")
                }
                key={r.id}
              >
                <div className="split">
                  <Avatar
                    person={state.directory.find(
                      (p) =>
                        p.id ===
                        (requestTab === "My inbox"
                          ? r.requester_id
                          : r.recipient_id),
                    )}
                    size={31}
                  />
                  <span className={"request-status " + r.status.toLowerCase()}>
                    {r.access_changed
                      ? "Access changed"
                      : r.status === "Delivered"
                        ? "Awaiting update"
                        : r.status === "Responded"
                          ? "Answered"
                          : r.status}
                  </span>
                </div>
                <h4>
                  {requestTab === "My inbox"
                    ? r.requester_name
                    : r.recipient_name}
                </h4>
                <p>{r.prompt}</p>
                <div className="request-meta">
                  <span>
                    <Link2 size={10} />
                    {r.channel === "google_chat"
                      ? "Google Chat and TeamPulse inbox"
                      : "TeamPulse inbox"}
                  </span>
                  <span>{ago(r.created_at, now)}</span>
                </div>
                {r.status === "Queued" && (
                  <p className="request-delivery-note">{r.delivery_detail}</p>
                )}
                {r.response && (
                  <div className="request-response">
                    <span>
                      <CheckCircle2 size={11} />
                      Employee update
                    </span>
                    <p>{r.response}</p>
                    {r.work_item_id && (
                      <button
                        onClick={() => {
                          if (state.work.some((w) => w.id === r.work_item_id))
                            void nav.openWork(r.work_item_id!);
                        }}
                      >
                        Open updated work
                        <ArrowUpRight size={11} />
                      </button>
                    )}
                  </div>
                )}
                {r.can_reply && (
                  <button
                    className="button primary small request-reply"
                    onClick={() => setReply(r)}
                  >
                    Reply & update work
                    <ArrowUpRight size={13} />
                  </button>
                )}
                {requestTab === "Requested" &&
                  ["Delivered", "Queued"].includes(r.status) && (
                    <button
                      className="cancel-request"
                      disabled={busy}
                      onClick={() =>
                        cancel
                          .mutateAsync(r.id)
                          .catch((e) => setError(errorMessage(e)))
                      }
                    >
                      Cancel request
                    </button>
                  )}
              </article>
            ))
          ) : (
            <Empty
              title={
                requestTab === "My inbox"
                  ? "No requests waiting"
                  : "A little coordination starts here"
              }
              description={
                requestTab === "My inbox"
                  ? "When a manager requests your update, you can reply here."
                  : "Mention a teammate in chat to prepare an update request."
              }
            />
          )}
        </div>
        <div className="updates-channel-note">
          <Link2 size={13} />
          <p>
            Requests arrive in the TeamPulse inbox. People who connect Google
            Chat in Settings also get them there, and can reply in a message.
          </p>
        </div>
      </aside>
      {reply && (
        <UpdateReplyDialog
          request={reply}
          state={state}
          onClose={() => setReply(null)}
        />
      )}
    </div>
  );
}
