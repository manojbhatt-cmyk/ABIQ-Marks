import { ArrowRight, Mail, Paperclip, Plus, Search, Send, User } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmt, openFile, ROLE_LABEL, useApi } from "../api";
import { Chip, Empty, ErrorState, Field, Loading, Modal, PageHeader, useAction } from "../components/ui";
import { useApp } from "../context";

const KIND: Record<string, string> = {
  kickoff: "Kickoff",
  impact_note: "Impact note",
  committee_pack: "Committee pack",
  approval_request: "Approval request",
  distribution: "Distribution",
  monthly_request: "Monthly request",
  note: "Note",
};

export default function Messages() {
  const { data, error, loading, reload } = useApi<any[]>("/messages", []);
  const dir = useApi<any>("/directory", []);
  const { cycle } = useApp();
  const [sel, setSel] = useState<string | null>(null);
  const [box, setBox] = useState<"in" | "sent">("in");
  const [compose, setCompose] = useState(false);
  const [search, setSearch] = useState("");
  const [to, setTo] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const act = useAction();
  const nav = useNavigate();

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;

  const list = data!.filter((m) => (box === "sent" ? m.sent : !m.sent))
    .filter((m) => !search || m.subject.toLowerCase().includes(search.toLowerCase()) || m.from.toLowerCase().includes(search.toLowerCase()));
  const m = list.find((x) => x.id === sel) || list[0];

  const open = (x: any) => {
    setSel(x.id);
    if (!x.read && !x.sent) {
      api(`/messages/${x.id}/read`, { body: {} }).then(reload);
    }
  };

  const options = [
    ...(dir.data?.teams || []).map((t: any) => ({ v: `team:${t.id}`, l: t.name })),
    ...["pm_team", "committee_member", "committee_chair", "governance", "finance_ir", "sct", "ac_manager"].map((r) => ({
      v: `role:${r}`,
      l: `All ${ROLE_LABEL[r]}`,
    })),
    ...(dir.data?.users || []).map((u: any) => ({ v: u.email, l: `${u.name} (${ROLE_LABEL[u.role]})` })),
  ];

  const unreadCount = data!.filter((x) => !x.sent && !x.read).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages & Notifications"
        subtitle="Governed communications inside ABIQ. Official memos, kickoff notices, impact notes, and committee packs."
        actions={
          <button className="btn btn-primary shadow-sm gap-2" onClick={() => setCompose(true)}>
            <Send size={14} />
            <span>New Message</span>
          </button>
        }
      />

      {act.node}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 items-start">
        {/* Left Pane: Inbox / Sent Listing (5 cols) */}
        <div className="card overflow-hidden shadow-sm xl:col-span-5 flex flex-col min-h-[600px]">
          {/* Box Switcher Tabs */}
          <div className="flex border-b border-line bg-surface-2/40">
            <button
              onClick={() => { setBox("in"); setSel(null); }}
              className={`flex-1 py-3 px-4 text-xs font-bold transition-colors border-b-2 ${
                box === "in"
                  ? "border-brand-600 text-brand-700 dark:text-brand-400 bg-surface"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              Inbox {unreadCount > 0 && <span className="ml-1.5 badge badge-info !h-[18px] !px-1.5 num">{unreadCount}</span>}
            </button>
            <button
              onClick={() => { setBox("sent"); setSel(null); }}
              className={`flex-1 py-3 px-4 text-xs font-bold transition-colors border-b-2 ${
                box === "sent"
                  ? "border-brand-600 text-brand-700 dark:text-brand-400 bg-surface"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              Sent Items
            </button>
          </div>

          {/* Search Box */}
          <div className="p-3 border-b border-line bg-surface">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                className="input !h-[34px] !pl-8 text-xs"
                placeholder="Search messages by subject or sender..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Message List */}
          <div className="flex-1 overflow-y-auto divide-y divide-line/60">
            {list.length ? (
              list.map((x) => (
                <button
                  key={x.id}
                  onClick={() => open(x)}
                  className={`w-full p-3.5 text-left transition-colors flex items-start gap-3 ${
                    m?.id === x.id ? "bg-brand-50/50 dark:bg-brand-950/30 border-l-2 border-brand-600" : "hover:bg-surface-2"
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      x.read || x.sent ? "bg-transparent" : "bg-brand-500 shadow-sm"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`truncate text-[13px] ${x.read || x.sent ? "font-medium text-ink" : "font-bold text-ink"}`}>
                        {x.subject}
                      </span>
                      <span className="text-[11px] text-muted shrink-0 num">
                        {fmt.date(x.at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11.5px] text-muted">
                      <span className="badge badge-gray !text-[10px] !py-0 !h-[18px]">
                        {KIND[x.kind] || x.kind}
                      </span>
                      <span className="truncate">
                        {box === "sent" ? `To: ${x.to.map((s: string) => s.split("@")[0]).join(", ")}` : x.from.split("@")[0]}
                      </span>
                      {x.day !== null && <span className="num text-faint">· Day {x.day}</span>}
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <Empty text="No messages found" hint="Messages related to cycle milestones will appear in your inbox." />
            )}
          </div>
        </div>

        {/* Right Pane: Message Viewer (7 cols) */}
        <div className="card shadow-sm xl:col-span-7 p-6 min-h-[600px] flex flex-col justify-between">
          {m ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="badge badge-info font-semibold !text-[11px]">
                      {KIND[m.kind] || m.kind}
                    </span>
                    {m.day !== null && (
                      <span className="badge badge-gray !text-[11px] num">
                        Cycle Day {m.day}
                      </span>
                    )}
                  </div>
                  <h2 className="text-[19px] font-bold tracking-tight text-ink">
                    {m.subject}
                  </h2>
                  <div className="mt-2 text-xs text-muted flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink flex items-center gap-1">
                      <User size={13} /> {m.from}
                    </span>
                    <span>·</span>
                    <span>To: {m.to.join(", ")}</span>
                    <span>·</span>
                    <span className="num">{fmt.date(m.at)}</span>
                  </div>
                </div>

                {m.link && (
                  <button
                    className="btn btn-primary btn-sm shadow-sm gap-1.5 shrink-0"
                    onClick={() => nav(m.link)}
                  >
                    <span>Open in ABIQ</span>
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>

              {/* Message Body */}
              <div className="rounded-card border border-line bg-surface-2/30 p-5 text-[13.5px] leading-relaxed text-ink whitespace-pre-wrap font-sans">
                {m.body}
              </div>

              {/* Attachments */}
              {m.attachments?.length > 0 && (
                <div className="pt-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Attachments</div>
                  <div className="flex flex-wrap gap-2">
                    {m.attachments.map((a: any) => (
                      <button
                        key={a.path}
                        className="btn btn-secondary btn-sm gap-1.5 text-xs font-medium"
                        onClick={() => openFile(`/api/files/${a.store}/${a.path}`)}
                      >
                        <Paperclip size={13} />
                        <span>{a.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-center">
              <Mail size={32} className="text-muted/50 mb-3" />
              <div className="text-[14px] font-bold text-ink">Select a message</div>
              <div className="text-xs text-muted mt-1 max-w-xs">
                Pick a message from the list on the left to review its content and attachments.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compose Modal */}
      {compose && (
        <Modal
          title="Compose Governed Message"
          onClose={() => setCompose(false)}
          wide
          footer={
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setCompose(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm gap-1.5"
                disabled={!to.length || !body}
                onClick={() =>
                  act.run(async () => {
                    await api("/messages", { body: { to, subject, body, cycle_id: cycle?.id } });
                    setCompose(false);
                    setTo([]);
                    setSubject("");
                    setBody("");
                    setBox("sent");
                    reload();
                  })
                }
              >
                <Send size={13} />
                <span>Send Memo</span>
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Recipients (Teams, Roles or Users)">
              <select
                className="input"
                value=""
                onChange={(e) => e.target.value && !to.includes(e.target.value) && setTo([...to, e.target.value])}
              >
                <option value="">Select recipient group or person...</option>
                {options.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </Field>

            {to.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {to.map((t) => (
                  <span
                    key={t}
                    className="badge badge-info gap-1.5 !text-xs cursor-pointer hover:badge-red"
                    onClick={() => setTo(to.filter((x) => x !== t))}
                  >
                    <span>{options.find((o) => o.v === t)?.l || t}</span>
                    <span className="font-bold">×</span>
                  </span>
                ))}
              </div>
            )}

            <Field label="Subject Line">
              <input
                className="input"
                placeholder="e.g. Q3 Valuation Kickoff Instructions"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </Field>

            <Field label="Message Body" help="Markdown formatting supported. This communication is audited and stored in the cycle log.">
              <textarea
                className="input h-44 font-mono text-[12.5px] leading-relaxed"
                placeholder="Write your governed memo or operational instructions here..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
