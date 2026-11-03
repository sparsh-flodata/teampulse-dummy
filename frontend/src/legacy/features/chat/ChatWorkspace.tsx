import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Send,
  Plus,
  X,
  Users,
  Check,
  ArrowUpRight,
  MessageSquare,
  Inbox,
  Clock3,
  CheckCircle2,
  Loader2,
  Link2,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import {
  api,
  State,
  Work,
  AgentAction,
  UpdateRequest,
  ago,
  isManager,
} from "../../lib";
import { Avatar, Badge, Empty, Modal } from "../../components/ui";
import { UpdateReplyDialog } from "./UpdateReplyDialog";
import { useChatViewport } from "./useChatViewport";

type Message = { role: string; message: string };
type ChatResult = {
  reply: string;
  action: AgentAction | null;
  auto_applied?: boolean;
};
export function ChatWorkspace({
  state,
  onDone,
  onWork,
}: {
  state: State;
  onDone: (message?: string) => Promise<void>;
  onWork: (work: Work) => void;
}) {
  const chatRoot = useChatViewport();
  const [messages, setMessages] = useState<Message[]>([]),
    [actions, setActions] = useState<AgentAction[]>([]),
    [requests, setRequests] = useState<UpdateRequest[]>([]),
    [text, setText] = useState(""),
    [context, setContext] = useState(""),
    [recipients, setRecipients] = useState<number[]>([]),
    [picker, setPicker] = useState(false),
    [peopleSearch, setPeopleSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [requestTab, setRequestTab] = useState(
      isManager(state.user) ? "Requested" : "My inbox",
    ),
    [reply, setReply] = useState<UpdateRequest | null>(null),
    [mobilePane, setMobilePane] = useState("Chat");
  const transcript = useRef<HTMLDivElement>(null),
    pending = useRef<{ signature: string; id: string } | null>(null),
    inboxInitialized = useRef(false);
  const candidates = state.directory.filter(
    (p) =>
      p.active && p.id !== state.user.id && state.profile_ids.includes(p.id),
  );
  const ownWork = state.work.filter(
    (w) => w.owner_id === state.user.id && w.status !== "Completed",
  );
  async function loadRequests() {
    const r = await api<UpdateRequest[]>("/update-requests");
    setRequests(r);
    if (!inboxInitialized.current) {
      inboxInitialized.current = true;
      if (
        r.some(
          (request) =>
            request.recipient_id === state.user.id && request.can_reply,
        )
      ) {
        setRequestTab("My inbox");
        setMobilePane("Updates");
      }
    }
  }
  async function loadHistory() {
    const r = await api<{ messages: Message[]; actions: AgentAction[] }>(
      "/assistant/history",
    );
    setMessages(r.messages);
    setActions(r.actions);
  }
  useEffect(() => {
    loadHistory().catch((e) => setError(e.message));
    loadRequests().catch((e) => setError(e.message));
    const timer = setInterval(() => {
      if (!document.hidden) loadRequests().catch((e) => setError(e.message));
    }, 15000);
    return () => clearInterval(timer);
  }, [state.user.id]);
  useEffect(() => {
    const node = transcript.current;
    if (node)
      node.scrollTo({
        top: node.scrollHeight,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
  }, [messages, actions, busy]);
  async function send(message = text, selected = recipients) {
    if (!message.trim() || busy) return;
    setBusy(true);
    setError("");
    setText("");
    setPicker(false);
    const signature = JSON.stringify([message, context, selected]);
    if (pending.current?.signature !== signature)
      pending.current = { signature, id: crypto.randomUUID() };
    setMessages((m) => [...m, { role: "user", message }]);
    try {
      const r = await api<ChatResult>("/assistant/chat", {
        message,
        work_item_id: context ? Number(context) : null,
        recipient_ids: selected,
        request_id: pending.current!.id,
      });
      setMessages((m) => [...m, { role: "assistant", message: r.reply }]);
      if (r.action)
        setActions((a) => [
          r.action!,
          ...a.filter((old) => old.id !== r.action!.id),
        ]);
      if (r.auto_applied) await onDone("Progress saved to your work profile.");
      pending.current = null;
      setRecipients([]);
    } catch (e) {
      setError((e as Error).message);
      setText(message);
    } finally {
      setBusy(false);
    }
  }
  async function decide(action: AgentAction, approve: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ status: string; requests?: UpdateRequest[] }>(
        "/assistant/actions/" + action.id + "/decide",
        { approve },
      );
      setActions((a) =>
        a.map((x) => (x.id === action.id ? { ...x, status: r.status } : x)),
      );
      if (r.requests?.length) {
        setRequestTab("Requested");
        await loadHistory();
        await loadRequests();
        await onDone(
          r.requests.some((x) => x.status === "Delivered")
            ? "Update requests delivered to TeamPulse inboxes."
            : "Requests queued. The external channel is not configured.",
        );
      } else
        await onDone(approve ? "Confirmed and saved." : "Proposal dismissed.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
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
                A CLEARER PICTURE, ONE CONVERSATION AT A TIME
              </span>
              <h2>What should we move forward?</h2>
              <p>
                Plan your work, ask about your team, or request an update from
                someone you mention.
              </p>
              <div className="chat-suggestions">
                {(isManager(state.user)
                  ? [
                      {
                        title: "Collect team updates",
                        description:
                          "Ask your reporting team for progress and blockers.",
                        message: "Ask my team for updates",
                      },
                      {
                        title: "See what needs attention",
                        description:
                          "Find recorded blockers across your reporting scope.",
                        message: "Who is blocked?",
                      },
                      {
                        title: "Review my commitments",
                        description: "Get a clear picture of your own plan.",
                        message: "Summarize my commitments",
                      },
                    ]
                  : [
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
                    ]
                ).map((s) => (
                  <button key={s.title} onClick={() => send(s.message, [])}>
                    <strong>
                      {s.title}
                      <ArrowUpRight size={15} />
                    </strong>
                    <p>{s.description}</p>
                  </button>
                ))}
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
                decide={(approve) => decide(a, approve)}
              />
            ))}
          {busy && (
            <div className="chat-loading">
              <span />
              <span />
              <span />
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              <AlertCircle size={15} />
              {error}
            </div>
          )}
        </div>
        <div className="coord-composer-wrap">
          <form
            className="coord-composer"
            onSubmit={(e) => {
              e.preventDefault();
              send();
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
                  send();
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
            Requests respect your reporting permissions. WhatsApp can be
            connected later.
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
          {["Requested", "My inbox"].map((t) => (
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
                    {r.channel === "in_app"
                      ? "TeamPulse inbox"
                      : "WhatsApp · not configured"}
                  </span>
                  <span>{ago(r.created_at)}</span>
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
                          const w = state.work.find(
                            (w) => w.id === r.work_item_id,
                          );
                          if (w) onWork(w);
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
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api("/update-requests/" + r.id + "/cancel", {});
                          await loadRequests();
                          await onDone("Update request cancelled.");
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
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
            In-app delivery is active. The delivery adapter is ready for your
            future WhatsApp integration.
          </p>
        </div>
      </aside>
      {reply && (
        <UpdateReplyDialog
          request={reply}
          state={state}
          onClose={() => setReply(null)}
          onDone={async () => {
            await loadRequests();
            await onDone("Your reply was saved and your manager was notified.");
          }}
        />
      )}
    </div>
  );
}
function ProposalCard({
  action,
  state,
  busy,
  decide,
}: {
  action: AgentAction;
  state: State;
  busy: boolean;
  decide: (approve: boolean) => void;
}) {
  const payload = action.payload,
    request = payload.kind === "request_updates";
  const ids = Array.isArray(payload.recipient_ids)
    ? payload.recipient_ids.map(Number)
    : [];
  return (
    <div className="coord-proposal">
      <span className="eyebrow">
        <Sparkles size={13} />
        {request ? "REVIEW UPDATE REQUEST" : "REVIEW PROPOSED WORK CHANGE"}
      </span>
      {request ? (
        <>
          <h3>
            Ask {ids.length} teammate{ids.length === 1 ? "" : "s"} for an update
          </h3>
          <div className="proposal-people">
            {ids.map((id) => (
              <span key={id}>
                <Avatar
                  person={state.directory.find((p) => p.id === id)}
                  size={21}
                />
                {state.directory.find((p) => p.id === id)?.name}
              </span>
            ))}
          </div>
          <p className="proposal-request-message">
            {String(payload.request_prompt)}
          </p>
          <small>
            <Link2 size={12} />
            {payload.channel === "whatsapp"
              ? "WhatsApp is not configured. This will queue without sending."
              : "Delivery: TeamPulse in-app inbox"}
          </small>
        </>
      ) : (
        <>
          <h3>
            {payload.kind === "create" ? "New commitment" : "Update your work"}
          </h3>
          {Object.entries(payload)
            .filter(
              ([k, v]) =>
                v !== null &&
                v !== "" &&
                ![
                  "kind",
                  "note",
                  "recipient_ids",
                  "request_prompt",
                  "channel",
                ].includes(k),
            )
            .map(([k, v]) => (
              <div className="proposal-field" key={k}>
                <span>
                  {(
                    {
                      work_item_id: "Commitment",
                      title: "Deliverable",
                      project_id: "Project",
                      due_date: "Expected completion",
                      progress: "Progress",
                      effort_hours: "Estimated effort",
                      remaining_hours: "Remaining effort",
                      status: "Status",
                    } as Record<string, string>
                  )[k] || k}
                </span>
                <strong>
                  {k === "work_item_id"
                    ? state.work.find((w) => w.id === Number(v))?.title
                    : k === "project_id"
                      ? state.projects.find((p) => p.id === Number(v))?.name
                      : k === "progress"
                        ? v + "%"
                        : k.endsWith("hours")
                          ? v + "h"
                          : String(v)}
                </strong>
              </div>
            ))}
        </>
      )}
      <div className="proposal-controls">
        <button
          className="button small"
          disabled={busy}
          onClick={() => decide(false)}
        >
          Dismiss
        </button>
        <button
          className="button primary small"
          disabled={busy}
          onClick={() => decide(true)}
        >
          <Check size={14} />
          {request ? "Request updates" : "Confirm & save"}
        </button>
      </div>
    </div>
  );
}
