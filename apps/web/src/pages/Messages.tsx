import { ArrowRight, Paperclip, Send } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmt, openFile, ROLE_LABEL, useApi } from "../api";
import { Chip, Empty, ErrorState, Field, Loading, Modal, PageHeader, useAction } from "../components/ui";
import { useApp } from "../context";

const KIND: Record<string, string> = { kickoff: "Kickoff", impact_note: "Impact note", committee_pack: "Committee pack", approval_request: "Approval request",
  distribution: "Distribution", monthly_request: "Monthly request", note: "Note" };

export default function Messages() {
  const { data, error, loading, reload } = useApi<any[]>("/messages", []);
  const dir = useApi<any>("/directory", []);
  const { cycle } = useApp();
  const [sel, setSel] = useState<string | null>(null);
  const [box, setBox] = useState<"in" | "sent">("in");
  const [compose, setCompose] = useState(false);
  const [to, setTo] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const act = useAction();
  const nav = useNavigate();
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const list = data!.filter((m) => (box === "sent" ? m.sent : !m.sent));
  const m = list.find((x) => x.id === sel) || list[0];
  const open = (x: any) => { setSel(x.id); if (!x.read && !x.sent) api(`/messages/${x.id}/read`, { body: {} }).then(reload); };
  const options = [...(dir.data?.teams || []).map((t: any) => ({ v: `team:${t.id}`, l: t.name })),
    ...["pm_team", "committee_member", "committee_chair", "governance", "finance_ir", "sct", "ac_manager"].map((r) => ({ v: `role:${r}`, l: `All ${ROLE_LABEL[r]}` })),
    ...(dir.data?.users || []).map((u: any) => ({ v: u.email, l: `${u.name} (${ROLE_LABEL[u.role]})` }))];
  return (
    <>
      <PageHeader title="Messages" subtitle="Everything inside AllianceBernstein happens here. Email is only for borrowers and Lincoln."
        actions={<button className="btn-primary" onClick={() => setCompose(true)}><Send size={14} /> New message</button>} />
      {act.node}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="card xl:col-span-4 overflow-hidden">
          <div className="flex border-b border-line">{(["in", "sent"] as const).map((b) => <button key={b} onClick={() => setBox(b)} className={`-mb-px flex-1 border-b-2 py-2.5 text-[13px] font-medium ${box === b ? "border-brand-600 text-ink" : "border-transparent text-muted hover:text-ink"}`}>{b === "in" ? `Inbox (${data!.filter((x) => !x.sent && !x.read).length} new)` : "Sent"}</button>)}</div>
          <div className="max-h-[70vh] overflow-y-auto p-2">
            {list.length ? list.map((x) => (
              <button key={x.id} onClick={() => open(x)} className={`mb-1 w-full rounded-xl px-3 py-2.5 text-left ${m?.id === x.id ? "bg-brand-50" : "hover:bg-canvas-100"}`}>
                <div className="flex items-center justify-between gap-2"><span className={`truncate text-sm ${x.read || x.sent ? "" : "font-bold"}`}>{x.subject}</span>{!x.read && !x.sent && <span className="h-2 w-2 shrink-0 rounded-full bg-accent-500" aria-label="Unread" />}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400"><Chip tone="blue">{KIND[x.kind] || x.kind}</Chip>{box === "sent" ? `to ${x.to.length} people` : x.from}{x.day !== null && ` · day ${x.day}`}</div>
              </button>)) : <Empty text="No messages" />}
          </div>
        </div>
        <div className="card xl:col-span-8 p-6">
          {m ? <>
            <div className="flex items-start justify-between gap-4">
              <div><div className="text-xl font-bold text-navy-900">{m.subject}</div>
                <div className="mt-1 text-xs text-slate-500">From {m.from} ({ROLE_LABEL[m.from_role] || m.from_role}) to {m.to.join(", ")} · {fmt.date(m.at)}</div></div>
              {m.link && <button className="btn-primary shrink-0" onClick={() => nav(m.link)}>Open in ABIQ <ArrowRight size={14} /></button>}
            </div>
            <div className="mt-5 whitespace-pre-wrap rounded-xl bg-canvas-50 p-4 text-sm leading-relaxed">{m.body}</div>
            {m.attachments?.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{m.attachments.map((a: any) => <button key={a.path} className="flex items-center gap-1 rounded-lg border border-canvas-200 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50" onClick={() => openFile(`/api/files/${a.store}/${a.path}`)}><Paperclip size={12} />{a.name}</button>)}</div>}
          </> : <Empty text="Select a message" />}
        </div>
      </div>
      {compose && (
        <Modal title="New message" onClose={() => setCompose(false)} footer={<><button className="btn-secondary" onClick={() => setCompose(false)}>Cancel</button>
          <button className="btn-primary" disabled={!to.length || !body} onClick={() => act.run(async () => { await api("/messages", { body: { to, subject, body, cycle_id: cycle?.id } }); setCompose(false); setTo([]); setSubject(""); setBody(""); setBox("sent"); reload(); })}><Send size={13} /> Send in ABIQ</button></>}>
          <Field label="To"><select className="input" value="" onChange={(e) => e.target.value && !to.includes(e.target.value) && setTo([...to, e.target.value])}><option value="">Add a team, role or person</option>{options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></Field>
          <div className="my-2 flex flex-wrap gap-1">{to.map((t) => <button key={t} onClick={() => setTo(to.filter((x) => x !== t))}><Chip tone="violet">{options.find((o) => o.v === t)?.l || t} ×</Chip></button>)}</div>
          <Field label="Subject"><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
          <div className="mt-2"><Field label="Message"><textarea className="input h-36" value={body} onChange={(e) => setBody(e.target.value)} /></Field></div>
        </Modal>)}
    </>
  );
}
