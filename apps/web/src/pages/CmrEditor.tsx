import { FileDown, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { api, fmt, openFile, useApi } from "../api";
import { AiCard, Card, Chip, Empty, ErrorState, Field, Loading, Modal, StatusChip, useAction } from "../components/ui";

export default function CmrEditor({ loanId, onChange }: { loanId: string; onChange: () => void }) {
  const { data, error, loading, reload } = useApi<any>(`/loans/${loanId}/cmr`, [loanId]);
  const docs = useApi<any>(`/loans/${loanId}`, [loanId]);
  const act = useAction();
  const [sel, setSel] = useState<string>("summary");
  const [text, setText] = useState("");
  const [rec, setRec] = useState<any>({});
  const [findings, setFindings] = useState<any[] | null>(null);
  const cur = data?.sections?.find((s: any) => s.code === sel);
  useEffect(() => { setText(cur?.body || ""); }, [cur?.id, cur?.body]);
  useEffect(() => { if (data?.recommendation) setRec(data.recommendation); }, [data?.recommendation?.id, data?.recommendation?.rationale]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const refresh = () => { reload(); onChange(); };
  if (!data) return <Card title="CMR"><Empty text="No CMR yet for this quarter." action={<button className="btn-primary" onClick={() => act.run(async () => { await api(`/loans/${loanId}/cmr`, { body: {} }); refresh(); })}>Create CMR</button>} />{act.node}</Card>;
  const c = data.cmr;
  const editable = c.status === "draft";
  const sug = data.recommendation_suggestion;
  const comments = data.reviews.flatMap((r: any) => r.comments.map((x: any) => ({ ...x, stage: r.stage })));
  const mb = c.mark_block || {};
  return (
    <>
      {act.node}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          {data.files.map((f: any) => <Chip key={f.version} tone="green">v{f.version} filed {fmt.date(f.filed_at)}</Chip>)}
          <Chip tone="blue">v{c.version}</Chip><StatusChip status={c.status} />{c.stage && <Chip tone="amber">at {fmt.label(c.stage)}</Chip>}
        </div>
        <div className="flex gap-2">
          {editable && <button className="btn-secondary" onClick={() => act.run(async () => { await api(`/cmr/${c.id}/draft`, { body: {} }); refresh(); })}><Sparkles size={14} /> Draft all with TIQ</button>}
          <button className="btn-secondary" onClick={() => openFile(`/api/cmr/${c.id}/pdf`)}><FileDown size={14} /> Export PDF</button>
          {editable && <button className="btn-primary" onClick={() => act.run(async () => { const r = await api(`/cmr/${c.id}/submit`, { body: {} }); if (!r.submitted) setFindings(r.findings); else refresh(); })}>Submit for review</button>}
        </div>
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="card col-span-2 p-2">
          {data.sections.map((s: any) => (
            <button key={s.id} onClick={() => setSel(s.code)} className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${sel === s.code ? "bg-brand-50 text-brand-700" : "hover:bg-canvas-100"}`}>
              <div className="font-medium">{s.title}</div>
              <div className="mt-0.5 flex gap-1"><StatusChip status={s.status} />{s.comments > 0 && <Chip tone="red">{s.comments}</Chip>}</div>
            </button>))}
        </div>
        <div className="col-span-6 space-y-4">
          {cur && (
            <Card title={cur.title} actions={cur.kept_ratio !== null && cur.kept_ratio !== undefined && cur.status !== "ai_draft" ? <span className="text-[11px] text-slate-400">from TIQ draft{cur.status === "edited" ? ", edited" : ""}</span> : null}>
              {cur.draft && cur.status === "ai_draft" && (
                <AiCard evidence={<>{cur.citations.map((ct: any, i: number) => <button key={i} className="mr-2 rounded bg-white px-1.5 py-0.5 text-info-600" onClick={() => ct.doc_id && api(`/documents/${ct.doc_id}`).then((d) => openFile(d.url))}>[{i + 1}] {ct.file} p.{ct.page}</button>)}</>}
                  actions={editable ? <><button className="btn-primary" onClick={() => act.run(async () => { await api(`/cmr-sections/${cur.id}`, { body: { action: "accept" } }); refresh(); })}>Accept</button>
                    <button className="btn-secondary" onClick={() => setText(cur.draft)}>Edit</button>
                    <button className="btn-secondary" onClick={() => act.run(async () => { await api(`/cmr-sections/${cur.id}`, { body: { action: "reject" } }); refresh(); })}>Reject</button></> : undefined}>
                  {cur.draft}
                </AiCard>)}
              <textarea className="input mt-3 h-56" value={text} disabled={!editable} onChange={(e) => setText(e.target.value)} placeholder="Write this section, or ask TIQ to draft it" />
              <div className="mt-2 flex gap-2">
                {editable && <button className="btn-primary" disabled={text === (cur.body || "")} onClick={() => act.run(async () => { await api(`/cmr-sections/${cur.id}`, { body: { action: cur.draft ? "edit" : "save", body: text } }); refresh(); })}>Save section</button>}
                {editable && <button className="btn-secondary" onClick={() => act.run(async () => { await api(`/cmr/${c.id}/draft`, { body: { codes: [cur.code] } }); refresh(); })}><Sparkles size={13} /> Draft with TIQ</button>}
              </div>
              {comments.filter((x: any) => x.section === cur.code).map((x: any) => (
                <div key={x.id} className={`mt-3 rounded-lg px-3 py-2 text-sm ${x.resolved ? "bg-canvas-100 text-slate-500" : "bg-danger-100 text-danger-700"}`}>
                  <b>{fmt.label(x.stage)}:</b> {x.text} {x.resolved ? `(resolved: ${x.resolution_note})` : editable || c.status === "filed" ? <button className="ml-2 underline" onClick={() => act.run(async () => { const n = prompt("Resolution note"); if (n) { await api(`/comments/${x.id}/resolve`, { body: { note: n } }); refresh(); } })}>resolve</button> : null}
                </div>))}
            </Card>
          )}
          <Card title="Mark block (read-only, from Q15)">
            {mb.mark !== undefined ? <div className="text-sm">Quarter mark <b className="num">{fmt.mark(mb.mark)}</b>; Lincoln range {fmt.mark(mb.range_low)} to {fmt.mark(mb.range_high)}; approved by {mb.approved_by} on {mb.approved_at?.slice(0, 10)}.
              {mb.committee_mark !== undefined && <div className="mt-1">Committee mark <b className="num">{fmt.mark(mb.committee_mark)}</b>: {mb.committee_rationale}</div>}</div> : <div className="text-sm text-slate-400">To be updated after Lincoln's report and the Deal Team's G1 decision.</div>}
          </Card>
        </div>
        <div className="col-span-4 space-y-4">
          {sug && sug.status === "proposed" && (
            <AiCard title="TIQ suggests a recommendation" confidence={0.8} actions={editable ? <button className="btn-secondary" onClick={() => setRec({ ...rec, ...sug.payload })}>Use these values</button> : undefined}>
              {sug.payload.text} <div className="mt-1 text-xs">{sug.payload.rationale}</div>
            </AiCard>)}
          <Card title="Recommendation">
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Rating (previous ${rec.previous_rating ?? "-"})`}><select className="input" disabled={!editable} value={rec.proposed_rating ?? ""} onChange={(e) => setRec({ ...rec, proposed_rating: Number(e.target.value) })}><option value="">-</option>{Object.entries(data.rating_labels).map(([k, v]: any) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Watchlist"><select className="input" disabled={!editable} value={rec.watchlist_action ?? ""} onChange={(e) => setRec({ ...rec, watchlist_action: e.target.value })}>{["", "add", "keep", "remove", "none"].map((x) => <option key={x} value={x}>{x || "-"}</option>)}</select></Field>
              <Field label="Waiver requested"><select className="input" disabled={!editable} value={rec.waiver_requested ? "yes" : "no"} onChange={(e) => setRec({ ...rec, waiver_requested: e.target.value === "yes" })}><option>no</option><option>yes</option></select></Field>
              <Field label="Expected mark direction"><select className="input" disabled={!editable} value={rec.expected_mark_direction ?? ""} onChange={(e) => setRec({ ...rec, expected_mark_direction: e.target.value })}>{["", "down", "flat", "up"].map((x) => <option key={x} value={x}>{x || "-"}</option>)}</select></Field>
            </div>
            {rec.waiver_requested && <Field label="Waiver conditions"><input className="input" disabled={!editable} value={rec.waiver_conditions ?? ""} onChange={(e) => setRec({ ...rec, waiver_conditions: e.target.value })} /></Field>}
            <Field label="Rationale"><textarea className="input h-20" disabled={!editable} value={rec.rationale ?? ""} onChange={(e) => setRec({ ...rec, rationale: e.target.value })} /></Field>
            {editable && <button className="btn-primary mt-2" onClick={() => act.run(async () => { await api(`/cmr/${c.id}/recommendation`, { method: "PUT", body: rec }); refresh(); })}>Save recommendation</button>}
          </Card>
          <Card title="Evidence">
            {(docs.data?.documents || []).map((d: any) => {
              const on = data.evidence.some((e: any) => e.document_id === d.id);
              return <label key={d.id} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" checked={on} disabled={!editable || on} onChange={() => act.run(async () => { await api(`/cmr/${c.id}/evidence`, { body: { document_id: d.id, supports: d.doc_type === "sponsor_letter" ? "mitigant" : "recommendation" } }); refresh(); })} />{d.file_name}<span className="text-[11px] text-slate-400">{fmt.label(d.doc_type)}</span></label>;
            })}
          </Card>
          <Card title="Review Checker (A3)" ai>
            {(c.findings || []).length ? c.findings.map((f: any, i: number) => <div key={i} className="mb-1 flex items-start gap-2 text-sm"><StatusChip status={f.result === "pass" ? "passed" : f.result} /><span><b>{fmt.label(f.item)}</b>: {f.reason}</span></div>) : <div className="text-sm text-slate-400">Runs on submit.</div>}
          </Card>
          <Card title="Versions">{data.files.length ? data.files.map((f: any) => <div key={f.version} className="flex justify-between text-sm"><button className="text-info-600 hover:underline" onClick={() => openFile(`/api/files/sharepoint/${f.path}`)}>v{f.version}</button><span className="text-xs text-slate-400">{f.filed_by} {fmt.date(f.filed_at)}</span></div>) : <div className="text-sm text-slate-400">Not filed yet</div>}</Card>
        </div>
      </div>
      {findings && (
        <Modal title="Review Checker found items to look at" onClose={() => setFindings(null)} footer={<><button className="btn-secondary" onClick={() => setFindings(null)}>Fix first</button><button className="btn-primary" onClick={() => act.run(async () => { await api(`/cmr/${c.id}/submit`, { body: { acknowledge: true } }); setFindings(null); refresh(); })}>Acknowledge and submit</button></>}>
          {findings.filter((f) => f.result !== "pass").map((f, i) => <div key={i} className="mb-2"><StatusChip status={f.result} /> <b>{fmt.label(f.item)}</b>: {f.reason}</div>)}
        </Modal>)}
    </>
  );
}
