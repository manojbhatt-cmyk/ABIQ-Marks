import { BookOpen, FileDown, FileText, MessageSquareWarning, PenLine, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, fmt, openFile, useApi } from "../api";
import { AiChip, Card, Chip, Empty, ErrorState, Field, Loading, Modal, Seg, StatusChip, useAction } from "../components/ui";

type Cite = { doc_id?: string; file?: string; page?: number };

/** Source chips under a section: open the document at the cited page. */
function Sources({ cites }: { cites: Cite[] }) {
  const list = (cites || []).filter((c) => c.file);
  if (!list.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted">Sources</span>
      {list.map((c, i) => (
        <button key={i} className="badge badge-gray hover:border-strong" title={`Open ${c.file} at page ${c.page}`}
          onClick={() => c.doc_id && api(`/documents/${c.doc_id}`).then((d) => openFile(d.url))}>
          <FileText size={12} aria-hidden="true" />{c.file}{c.page ? ` p.${c.page}` : ""}
        </button>))}
    </div>
  );
}

/** The whole CMR as one document: numbered sections on hairlines, sources under each. */
function ReadView({ data, borrower }: { data: any; borrower?: string }) {
  const c = data.cmr, r = data.recommendation || {}, mb = c.mark_block || {};
  return (
    <article className="card mx-auto max-w-[880px]">
      <header className="border-b border-line px-8 pb-5 pt-7">
        <div className="text-xs font-medium text-muted">Credit monitoring review · {fmt.label(c.type)} · v{c.version}</div>
        <h2 className="mt-1 text-[20px] font-semibold text-ink">{borrower || "CMR"}</h2>
        <div className="mt-3 flex flex-wrap gap-2"><StatusChip status={c.status} />{c.stage && <Chip tone="amber" dot>At {fmt.label(c.stage)}</Chip>}</div>
      </header>
      {data.sections.map((s: any, i: number) => {
        const text = s.body || "";
        return (
          <section key={s.id} className="border-b border-line px-8 py-6">
            <h3 className="flex items-baseline gap-3 text-[15px] font-semibold text-ink"><span className="num text-[13px] font-medium text-faint">{String(i + 1).padStart(2, "0")}</span>{s.title}</h3>
            {text ? <div className="mt-2 whitespace-pre-wrap pl-8 text-[14px] leading-[1.65] text-ink">{text}</div>
              : <div className="mt-2 pl-8 text-[13.5px] italic text-faint">Not written yet.</div>}
            <div className="pl-8"><Sources cites={s.citations} /></div>
          </section>);
      })}
      <section className="grid gap-4 px-8 py-6 md:grid-cols-2">
        <div className="rounded-panel border border-line p-4">
          <div className="text-xs font-medium text-muted">Recommendation</div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13.5px]">
            <dt className="text-muted">Rating</dt><dd className="num">{r.previous_rating ?? "-"} to {r.proposed_rating ?? "-"}</dd>
            <dt className="text-muted">Watchlist</dt><dd>{r.watchlist_action || "-"}</dd>
            <dt className="text-muted">Waiver</dt><dd>{r.waiver_requested ? `yes${r.waiver_conditions ? `: ${r.waiver_conditions}` : ""}` : "no"}</dd>
            <dt className="text-muted">Mark direction</dt><dd>{r.expected_mark_direction || "-"}</dd>
          </dl>
          {r.rationale && <p className="mt-3 border-t border-line pt-3 text-[13.5px] leading-relaxed">{r.rationale}</p>}
        </div>
        <div className="rounded-panel border border-line p-4">
          <div className="text-xs font-medium text-muted">Mark (from Gate 1)</div>
          {mb.mark !== undefined ? <div className="mt-2 text-[13.5px] leading-relaxed">Quarter mark <b className="num">{fmt.mark(mb.mark)}</b>, Lincoln range <span className="num">{fmt.mark(mb.range_low)} to {fmt.mark(mb.range_high)}</span>. Approved by {mb.approved_by} on {mb.approved_at?.slice(0, 10)}.
            {mb.committee_mark !== undefined && <div className="mt-1">Committee mark <b className="num">{fmt.mark(mb.committee_mark)}</b>: {mb.committee_rationale}</div>}</div>
            : <div className="mt-2 text-[13.5px] text-faint">Added after Lincoln's report and the Deal Team's Gate 1 decision.</div>}
        </div>
      </section>
    </article>
  );
}

export default function CmrEditor({ loanId, onChange }: { loanId: string; onChange: () => void }) {
  const { data, error, loading, reload } = useApi<any>(`/loans/${loanId}/cmr`, [loanId]);
  const docs = useApi<any>(`/loans/${loanId}`, [loanId]);
  const act = useAction();
  const [view, setView] = useState<"edit" | "read">("edit");
  const [sel, setSel] = useState<string>("summary");
  const [text, setText] = useState("");
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [allNote, setAllNote] = useState("");
  const [rec, setRec] = useState<any>({});
  const [findings, setFindings] = useState<any[] | null>(null);
  const cur = data?.sections?.find((s: any) => s.code === sel);
  useEffect(() => { setText(cur?.body || ""); setAsk(""); }, [cur?.id, cur?.body]);
  useEffect(() => { if (data?.recommendation) setRec(data.recommendation); }, [data?.recommendation?.id, data?.recommendation?.rationale]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const refresh = () => { reload(); onChange(); };
  if (!data) return <Card title="CMR"><Empty text="No CMR yet for this quarter" hint="Create it, then draft the sections with TIQ or write them yourself." action={<button className="btn-primary" onClick={() => act.run(async () => { await api(`/loans/${loanId}/cmr`, { body: {} }); refresh(); })}>Create CMR</button>} />{act.node}</Card>;
  const c = data.cmr;
  const editable = c.status === "draft";
  const sug = data.recommendation_suggestion;
  const comments = data.reviews.flatMap((r: any) => r.comments.map((x: any) => ({ ...x, stage: r.stage })));
  const idx = data.sections.findIndex((s: any) => s.code === sel);
  const pending = cur?.pending;
  const redraft = async () => {
    setAsking(true);
    try { await act.run(async () => { await api(`/cmr-sections/${cur.id}/redraft`, { body: { instruction: ask } }); setAsk(""); refresh(); }); }
    finally { setAsking(false); }
  };
  return (
    <>
      {act.node}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Seg value={view} onChange={(v) => setView(v as any)} options={[{ id: "edit", label: <><PenLine size={14} aria-hidden="true" /> Edit</> }, { id: "read", label: <><BookOpen size={14} aria-hidden="true" /> Read</> }]} />
          <Chip>v{c.version}</Chip><StatusChip status={c.status} />{c.stage && <Chip tone="amber" dot>At {fmt.label(c.stage)}</Chip>}
          {data.files.map((f: any) => <Chip key={f.version} tone="green" dot>v{f.version} filed {fmt.date(f.filed_at)}</Chip>)}
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && <button className="btn-secondary" onClick={() => setAllOpen(true)}><Sparkles size={16} aria-hidden="true" /> Draft all with TIQ</button>}
          <button className="btn-secondary" onClick={() => openFile(`/api/cmr/${c.id}/pdf`)}><FileDown size={16} aria-hidden="true" /> Export PDF</button>
          {editable && <button className="btn-primary" onClick={() => act.run(async () => { const r = await api(`/cmr/${c.id}/submit`, { body: {} }); if (!r.submitted) setFindings(r.findings); else refresh(); })}>Submit for review</button>}
        </div>
      </div>

      {view === "read" ? <ReadView data={data} borrower={docs.data?.loan?.borrower} /> : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[232px_minmax(0,1fr)_340px]">
          <nav aria-label="CMR sections" className="card self-start p-2">
            {data.sections.map((s: any, i: number) => (
              <button key={s.id} onClick={() => setSel(s.code)} aria-current={sel === s.code ? "true" : undefined}
                className={`flex w-full items-start gap-2.5 rounded-control px-2.5 py-2 text-left transition-colors duration-150 ${sel === s.code ? "bg-sunken" : "hover:bg-sunken"}`}>
                <span className={`num mt-px text-[12px] font-medium ${sel === s.code ? "text-accent-600" : "text-faint"}`}>{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] font-medium ${sel === s.code ? "text-ink" : "text-muted"}`}>{s.title}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {s.pending ? <AiChip>{s.pending.kind === "cmr_redraft" ? "Redraft" : "Draft"} to review</AiChip> : <StatusChip status={s.status} />}
                    {s.comments > 0 && <Chip tone="red" dot>{s.comments} comment{s.comments > 1 ? "s" : ""}</Chip>}
                  </span>
                </span>
              </button>))}
          </nav>

          <div className="min-w-0 space-y-4">
            {cur && (
              <Card title={<span className="flex items-baseline gap-2.5"><span className="num text-[13px] font-medium text-faint">{String(idx + 1).padStart(2, "0")}</span>{cur.title}</span>}
                actions={<><StatusChip status={cur.status} />{cur.kept_ratio != null && cur.status !== "ai_draft" && <span className="text-xs text-muted">from TIQ draft{cur.status === "edited" ? ", edited" : ""}</span>}</>}>
                {pending && cur.draft && (
                  <div className="ai-note mb-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <AiChip>{pending.kind === "cmr_redraft" ? "TIQ redraft" : "TIQ draft"}</AiChip>
                      {pending.instruction && <span className="text-[13px] text-muted">You asked: “{pending.instruction}”</span>}
                    </div>
                    {pending.nothing_found && <div className="mb-2 text-[13px] text-warn-700">TIQ found nothing new on this in the loan's documents. Add it in the text below, or attach the document first.</div>}
                    {pending.kind === "cmr_redraft" && cur.body && (
                      <details className="mb-2 text-[13px]"><summary className="cursor-pointer text-muted">Show the current text</summary><div className="mt-1 whitespace-pre-wrap text-muted">{cur.body}</div></details>)}
                    <div className="whitespace-pre-wrap text-[14px] leading-[1.65]">{cur.draft}</div>
                    {editable && <div className="mt-3 flex flex-wrap gap-2">
                      <button className="btn-secondary btn-sm" onClick={() => act.run(async () => { await api(`/cmr-sections/${cur.id}`, { body: { action: "accept" } }); refresh(); })}>Accept</button>
                      <button className="btn-secondary btn-sm" onClick={() => setText(cur.draft)}>Edit</button>
                      <button className="btn-ghost btn-sm" onClick={() => act.run(async () => { await api(`/cmr-sections/${cur.id}`, { body: { action: "reject" } }); refresh(); })}>Reject</button>
                    </div>}
                  </div>)}
                <textarea className="input min-h-[220px] leading-[1.65]" value={text} disabled={!editable} onChange={(e) => setText(e.target.value)} placeholder="Write this section, or ask TIQ to draft it" />
                <Sources cites={cur.citations} />
                {editable && <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-secondary" disabled={text === (cur.body || "")} onClick={() => act.run(async () => { await api(`/cmr-sections/${cur.id}`, { body: { action: cur.draft ? "edit" : "save", body: text } }); refresh(); })}>Save section</button>
                  <button className="btn-ghost" onClick={() => act.run(async () => { await api(`/cmr/${c.id}/draft`, { body: { codes: [cur.code] } }); refresh(); })}><Sparkles size={16} aria-hidden="true" /> Draft this section with TIQ</button>
                </div>}
                {editable && (
                  <div className="mt-5 rounded-panel border border-line bg-raised p-4">
                    <label htmlFor="tell-tiq" className="flex items-center gap-2 text-[13px] font-medium text-ink"><Wand2 size={16} className="text-accent-600" aria-hidden="true" /> Tell TIQ what's missing</label>
                    <p className="mt-0.5 text-xs text-muted">TIQ redrafts this section from the current text, your note and the loan's documents. You review the result before anything changes.</p>
                    <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                      <input id="tell-tiq" className="input flex-1" value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask.trim().length > 3 && !asking && redraft()}
                        placeholder="For example: add the sponsor equity commitment and when the funds arrive" />
                      <button className="btn-secondary" disabled={asking || ask.trim().length < 4} onClick={redraft}>{asking ? "Redrafting" : "Redraft"}</button>
                    </div>
                  </div>)}
                {comments.filter((x: any) => x.section === cur.code).map((x: any) => (
                  <div key={x.id} className={`mt-3 flex items-start gap-2 rounded-control border px-3 py-2.5 text-[13.5px] ${x.resolved ? "border-line text-muted" : "border-danger-100 bg-danger-50 text-danger-700"}`}>
                    <MessageSquareWarning size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <div className="flex-1"><b className="text-inherit">{fmt.label(x.stage)}:</b> {x.text} {x.resolved ? <span className="text-muted">(resolved: {x.resolution_note})</span> : editable || c.status === "filed" ? <button className="ml-2 underline" onClick={() => act.run(async () => { const n = prompt("Resolution note"); if (n) { await api(`/comments/${x.id}/resolve`, { body: { note: n } }); refresh(); } })}>Resolve</button> : null}</div>
                  </div>))}
              </Card>
            )}
          </div>

          <div className="space-y-4">
            {sug && sug.status === "proposed" && (
              <div className="ai-note">
                <div className="mb-1.5 flex items-center gap-2"><AiChip>TIQ suggests</AiChip><span className="text-[13px] font-medium">A recommendation</span></div>
                <div className="text-[13.5px]">{sug.payload.text}</div>
                <div className="mt-1 text-xs text-muted">{sug.payload.rationale}</div>
                {editable && <button className="btn-secondary btn-sm mt-3" onClick={() => setRec({ ...rec, ...sug.payload })}>Use these values</button>}
              </div>)}
            <Card title="Recommendation">
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Rating (previous ${rec.previous_rating ?? "-"})`}><select className="input" disabled={!editable} value={rec.proposed_rating ?? ""} onChange={(e) => setRec({ ...rec, proposed_rating: Number(e.target.value) })}><option value="">-</option>{Object.entries(data.rating_labels).map(([k, v]: any) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="Watchlist"><select className="input" disabled={!editable} value={rec.watchlist_action ?? ""} onChange={(e) => setRec({ ...rec, watchlist_action: e.target.value })}>{["", "add", "keep", "remove", "none"].map((x) => <option key={x} value={x}>{x || "-"}</option>)}</select></Field>
                <Field label="Waiver requested"><select className="input" disabled={!editable} value={rec.waiver_requested ? "yes" : "no"} onChange={(e) => setRec({ ...rec, waiver_requested: e.target.value === "yes" })}><option>no</option><option>yes</option></select></Field>
                <Field label="Mark direction"><select className="input" disabled={!editable} value={rec.expected_mark_direction ?? ""} onChange={(e) => setRec({ ...rec, expected_mark_direction: e.target.value })}>{["", "down", "flat", "up"].map((x) => <option key={x} value={x}>{x || "-"}</option>)}</select></Field>
              </div>
              <div className="mt-3 space-y-3">
                {rec.waiver_requested && <Field label="Waiver conditions"><input className="input" disabled={!editable} value={rec.waiver_conditions ?? ""} onChange={(e) => setRec({ ...rec, waiver_conditions: e.target.value })} /></Field>}
                <Field label="Rationale"><textarea className="input min-h-[88px]" disabled={!editable} value={rec.rationale ?? ""} onChange={(e) => setRec({ ...rec, rationale: e.target.value })} /></Field>
              </div>
              {editable && <button className="btn-secondary mt-3" onClick={() => act.run(async () => { await api(`/cmr/${c.id}/recommendation`, { method: "PUT", body: rec }); refresh(); })}>Save recommendation</button>}
            </Card>
            <Card title="Evidence" subtitle="Documents attached to this CMR">
              <div className="space-y-1">{(docs.data?.documents || []).map((d: any) => {
                const on = data.evidence.some((e: any) => e.document_id === d.id);
                return <label key={d.id} className="flex items-center gap-2.5 rounded-control px-1 py-1.5 text-[13px] hover:bg-sunken"><input type="checkbox" checked={on} disabled={!editable || on} onChange={() => act.run(async () => { await api(`/cmr/${c.id}/evidence`, { body: { document_id: d.id, supports: d.doc_type === "sponsor_letter" ? "mitigant" : "recommendation" } }); refresh(); })} /><span className="min-w-0 flex-1 truncate">{d.file_name}</span><span className="text-xs text-faint">{fmt.label(d.doc_type)}</span></label>;
              })}</div>
            </Card>
            <Card title={<span className="flex items-center gap-2">Review Checker <AiChip>A3</AiChip></span>} subtitle="Runs when you submit">
              {(c.findings || []).length ? <ul className="space-y-2">{c.findings.map((f: any, i: number) => <li key={i} className="flex items-start gap-2 text-[13px]"><StatusChip status={f.result === "pass" ? "passed" : f.result} /><span><b>{fmt.label(f.item)}</b>: {f.reason}</span></li>)}</ul> : <div className="text-[13px] text-faint">No findings yet.</div>}
            </Card>
            <Card title="Filed versions">{data.files.length ? data.files.map((f: any) => <div key={f.version} className="flex items-center justify-between py-1 text-[13px]"><button className="font-medium text-ink underline-offset-2 hover:underline" onClick={() => openFile(`/api/files/sharepoint/${f.path}`)}>v{f.version} PDF</button><span className="text-xs text-faint">{f.filed_by.split("@")[0]} · {fmt.date(f.filed_at)}</span></div>) : <div className="text-[13px] text-faint">Not filed yet</div>}</Card>
          </div>
        </div>
      )}

      {allOpen && (
        <Modal title="Draft all sections with TIQ" onClose={() => setAllOpen(false)} footer={<>
          <button className="btn-ghost" onClick={() => setAllOpen(false)}>Cancel</button>
          <button className="btn-primary" disabled={act.busy} onClick={() => act.run(async () => { await api(`/cmr/${c.id}/draft`, { body: { instruction: allNote } }); setAllOpen(false); setAllNote(""); refresh(); })}>{act.busy ? "Drafting" : "Draft all"}</button></>}>
          <p className="mb-3 text-[13.5px] text-muted">TIQ drafts every section from the approved spread and the loan's documents. Each draft waits for you to accept, edit or reject it.</p>
          <Field label="Anything TIQ should cover? (optional)" help="For example: stress the customer concentration and the waiver conditions.">
            <textarea className="input min-h-[88px]" value={allNote} onChange={(e) => setAllNote(e.target.value)} />
          </Field>
        </Modal>)}
      {findings && (
        <Modal title="Review Checker found items to look at" onClose={() => setFindings(null)} footer={<><button className="btn-secondary" onClick={() => setFindings(null)}>Fix first</button><button className="btn-primary" onClick={() => act.run(async () => { await api(`/cmr/${c.id}/submit`, { body: { acknowledge: true } }); setFindings(null); refresh(); })}>Acknowledge and submit</button></>}>
          <ul className="space-y-2">{findings.filter((f) => f.result !== "pass").map((f, i) => <li key={i} className="flex items-start gap-2"><StatusChip status={f.result} /><span><b>{fmt.label(f.item)}</b>: {f.reason}</span></li>)}</ul>
        </Modal>)}
    </>
  );
}
