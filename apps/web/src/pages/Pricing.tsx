import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { api, fmt, openFile, useApi } from "../api";
import { AiCard, AssumedChip, Banner, Card, Chip, ErrorState, Field, GateIcon, Loading, useAction, useConfirm } from "../components/ui";

function RangeBar({ low, high, point, mark, min, max }: { low: number; high: number; point: number; mark?: number | null; min: number; max: number }) {
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div className="relative mt-3 h-8">
      <div className="absolute top-3 h-2 w-full rounded bg-canvas-200" />
      <div className="absolute top-3 h-2 rounded bg-info-600/60" style={{ left: pos(low), width: `calc(${pos(high)} - ${pos(low)})` }} />
      <div className="absolute top-1.5 h-5 w-1 rounded bg-navy-900" style={{ left: pos(point) }} title={`Point ${point}`} />
      {mark !== undefined && mark !== null && <div className="absolute top-1.5 h-5 w-1 rounded bg-brand-600" style={{ left: pos(mark) }} title={`Mark ${mark}`} />}
      <div className="absolute top-6 text-[10px] text-slate-500" style={{ left: pos(low) }}>{low.toFixed(2)}</div>
      <div className="absolute top-6 text-[10px] text-slate-500" style={{ left: pos(high) }}>{high.toFixed(2)}</div>
    </div>
  );
}

export default function Pricing({ loanId, onChange }: { loanId: string; onChange: () => void }) {
  const { data, error, loading, reload } = useApi<any>(`/loans/${loanId}/pricing`, [loanId]);
  const act = useAction();
  const confirm = useConfirm();
  const [outcome, setOutcome] = useState<string>("");
  const [mark, setMark] = useState<string>("");
  const [rationale, setRationale] = useState("");
  const [reason, setReason] = useState("new_information");
  const [note, setNote] = useState("");
  const [usedDraft, setUsedDraft] = useState(false);
  const [ry, setRy] = useState<number | null>(null);
  const [cc, setCc] = useState<any>(null);
  useEffect(() => { if (data?.crosscheck && ry === null) setRy(data.crosscheck.required_yield); }, [data?.crosscheck]);
  useEffect(() => { if (ry !== null && data) api(`/loans/${loanId}/crosscheck?required_yield=${ry}`).then(setCc).catch(() => {}); }, [ry]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const refresh = () => { reload(); onChange(); };
  const v = data.versions[data.versions.length - 1];
  const k = data.knows;
  const decided = data.decisions.filter((d: any) => d.outcome !== "sent_back").pop();
  const waiting = data.loan.status === "waiting_on_lincoln";
  const ch = data.challenge?.payload;
  const qa = data.loan.loops?.QA || 0;
  const m = Number(mark);
  const outside = outcome === "approved_different_mark" && mark && v && (m < v.low || m > v.high);
  const gate = decided && !waiting && data.loan.status !== "sent_back" ? "passed" : data.ready && !waiting ? "open" : "closed";
  const words = outcome === "approved" ? `You are approving Lincoln's mark of ${v?.point?.toFixed(2)} for ${data.loan.borrower} as the Deal Team mark.`
    : outcome === "approved_different_mark" ? `You are approving ${data.loan.borrower} at ${m.toFixed(2)}, a different mark from Lincoln's ${v?.point?.toFixed(2)}${outside ? ", outside Lincoln's range, which puts the loan on the committee agenda" : ""}.`
      : `You are sending ${data.loan.borrower} back to Lincoln (version ${v?.version}) with reason "${fmt.label(reason)}". The note goes to Box and by email.`;
  return (
    <>
      {act.node}{confirm.node}
      {data.committee_note && <Banner tone="red">The committee sent this loan back (loop QF): {data.committee_note.rationale}</Banner>}
      {waiting && <Banner tone="amber">Waiting on Lincoln, loop QA x{qa}. The send-back note is in Box; the revised valuation appears here when received.</Banner>}
      <div className="mb-4 flex items-center gap-3">
        <GateIcon state={gate as any} /><span className="text-sm font-semibold">Gate G1: Deal Team approval</span>
        {decided && <span className="text-sm text-slate-500">passed: {fmt.label(decided.outcome)} {fmt.mark(decided.mark)} by {decided.decided_by} {fmt.date(decided.decided_at)}</span>}
        <span className="ml-auto flex gap-1">{data.versions.map((x: any) => <Chip key={x.version} tone={x.version === v.version ? "violet" : "neutral"}>Lincoln v{x.version} {x.point.toFixed(2)} ({x.valuation_date})</Chip>)}</span>
      </div>
      {!v ? <InternalValuation data={data} loanId={loanId} onDone={refresh} /> : (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-3 space-y-4">
            {data.versions.slice().reverse().map((x: any) => (
              <Card key={x.version} title={`Lincoln v${x.version}`} actions={x.report_document_id && <button className="btn-ghost" onClick={() => api(`/documents/${x.report_document_id}`).then((d) => openFile(d.url))}><FileText size={13} /> report</button>}>
                <div className="text-3xl font-bold num">{x.point.toFixed(2)}</div>
                <div className="text-xs text-slate-500">previous mark {fmt.mark(data.loan.previous_mark)}; required yield {fmt.pct(x.yield)}</div>
                <RangeBar low={x.low} high={x.high} point={x.point} mark={decided?.mark} min={Math.min(x.low, data.loan.previous_mark ?? x.low) - 1.5} max={Math.max(x.high, data.loan.previous_mark ?? x.high) + 1.5} />
                <div className="mt-4 text-xs"><div className="label">Methodology</div>{x.methodology}</div>
                <div className="mt-2 text-xs"><div className="label">Key assumptions</div><span className="italic">"{x.assumptions}"</span></div>
                {x.comments && <div className="mt-2 text-xs"><div className="label">Comments</div>{x.comments}</div>}
              </Card>))}
          </div>
          <div className="col-span-5 space-y-4">
            <Card title="What the Deal Team knows">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>CMR recommendation: rating {k.recommendation?.previous_rating} to {k.recommendation?.rating}, {k.recommendation?.direction}</div>
                <div>Covenant: {k.covenant?.result === "fail" ? <Chip tone="red">breached {fmt.x(k.covenant.actual)} vs {fmt.x(k.covenant.threshold)}</Chip> : <Chip tone="green">pass</Chip>}</div>
                <div>LTM adj. EBITDA {fmt.num(k.metrics.LTM_ADJ_EBITDA)}; debt {fmt.num(k.metrics.TOTAL_DEBT)}</div>
                <div>Interest cover {fmt.x(k.metrics.INTEREST_COVER)}</div>
                {k.sponsor_equity && <div className="col-span-2">Sponsor support: {k.sponsor_equity.sponsor} committed ${k.sponsor_equity.amount}M (letter {k.sponsor_equity.date}); net leverage after equity <b>{fmt.x(k.net_leverage_after_equity)}</b></div>}
              </div>
            </Card>
            {ch ? (
              <AiCard title="Challenge Assistant (A5)" confidence={data.challenge.payload.differences.length ? 0.85 : 0.6} status={data.challenge.status}>
                <div className="mb-2">{ch.summary}</div>
                {ch.differences.map((d: any, i: number) => (
                  <div key={i} className="mb-2 rounded-lg bg-white p-3">
                    <div className="text-xs italic text-slate-500">Lincoln: "{d.assumption_quote}"</div>
                    <div className="mt-1">{d.finding}</div>
                    {d.math && <div className="mt-1 font-mono text-xs">{d.math}</div>}
                    <div className="mt-1 flex gap-2"><Chip tone={d.materiality === "high" ? "red" : "neutral"}>materiality {d.materiality}</Chip>{d.evidence.map((e: any, j: number) => <button key={j} className="text-xs text-info-600 hover:underline" onClick={() => api(`/documents/${e.doc_id}`).then((dd) => openFile(dd.url))}>{e.file} p.{e.page}</button>)}</div>
                  </div>))}
                {ch.draft_note && <><div className="label mt-2">Draft send-back note</div><div className="rounded bg-white p-2 text-xs">{ch.draft_note}</div></>}
              </AiCard>
            ) : <button className="btn-secondary" disabled={!data.ready || !!decided} onClick={() => act.run(async () => { await api(`/loans/${loanId}/challenge`, { body: {} }); refresh(); })}>Run the Challenge Assistant</button>}
            <Card title="Decisions">{data.decisions.length ? data.decisions.map((d: any) => <div key={d.id} className="border-b border-canvas-100 py-1 text-sm"><Chip tone={d.outcome === "sent_back" ? "red" : "green"}>{fmt.label(d.outcome)}</Chip> v{d.lincoln_version} {d.mark ? fmt.mark(d.mark) : ""} by {d.decided_by} {fmt.date(d.decided_at)}<div className="text-xs text-slate-500">{d.note || d.rationale}</div>{d.box_note && <button className="text-xs text-info-600" onClick={() => openFile(`/api/files/box/${d.box_note}`)}>box/{d.box_note}</button>}</div>) : <div className="text-sm text-slate-400">None yet</div>}</Card>
          </div>
          <div className="col-span-4 space-y-4">
            {data.reunderwriting && (
              <Card title="Reunderwriting guidance (1 Sep 2026)">
                <div className="text-sm">{data.reunderwriting.security}, EBITDA band {data.reunderwriting.band} (${data.reunderwriting.band_range[0]}M to ${data.reunderwriting.band_range[1]}M, assumed)</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-sky-50 p-2"><div className="label">Market spread</div><div className="num font-bold">S+{data.reunderwriting.spread_bps}</div><div className="text-[11px] text-slate-500">May S+{data.reunderwriting.may_spread_bps}</div></div>
                  <div className="rounded-lg bg-teal-50 p-2"><div className="label">Max leverage</div><div className="num font-bold">{fmt.x(data.reunderwriting.max_leverage)}</div><div className="text-[11px] text-slate-500">May {fmt.x(data.reunderwriting.may_max_leverage)}</div></div>
                </div>
                <div className="mt-2 text-xs">Loan leverage <b>{fmt.x(k.metrics.LEVERAGE)}</b>{k.net_leverage_after_equity ? <>, {fmt.x(k.net_leverage_after_equity)} net of equity</> : null}: {(k.net_leverage_after_equity ?? k.metrics.LEVERAGE) > data.reunderwriting.max_leverage ? <Chip tone="amber">above market max</Chip> : <Chip tone="green">within market max</Chip>}</div>
              </Card>)}
            <Card title="Indicative cross-check">
              <div className="mb-2 rounded bg-warn-100 px-2 py-1 text-[11px] font-semibold text-warn-700">Indicative, not a mark</div>
              {cc && <div className="text-sm">Coupon {fmt.pct(cc.coupon, 2)}, {cc.years} years to maturity</div>}
              <Field label={`Required yield ${ry !== null ? (ry * 100).toFixed(1) : ""}%`}><input type="range" min={0.06} max={0.25} step={0.0025} value={ry ?? 0.1} onChange={(e) => setRy(Number(e.target.value))} className="w-full" /></Field>
              <div className="text-3xl font-bold num">{cc ? cc.indicative_price.toFixed(2) : "-"}</div>
            </Card>
            <Card title="Gate decision" actions={<AssumedChip dq="DQ15" what="approve at a different mark" />}>
              {gate === "passed" ? <div className="text-sm text-success-700">Decided. Q15: the mark is attached to the CMR.</div> : !data.ready ? <div className="text-sm text-slate-400">G1 opens when the CMR is filed (Q8) and Lincoln's draft is loaded to Everest (Q12).</div> : (
                <div className="space-y-3 text-sm">
                  {[["approved", "Approve (mark = Lincoln point)"], ["approved_different_mark", "Approve at a different mark"], ["sent_back", "Send back to Lincoln"]].map(([k2, l]) => (
                    <label key={k2} className="flex items-center gap-2"><input type="radio" name="o" checked={outcome === k2} onChange={() => setOutcome(k2)} />{l}</label>))}
                  {outcome === "approved_different_mark" && <>
                    <Field label="Mark"><input className="input num" value={mark} onChange={(e) => setMark(e.target.value)} /></Field>
                    {outside && <div className="rounded bg-warn-100 px-2 py-1 text-xs text-warn-700">Outside Lincoln's range {v.low} to {v.high}: this puts the loan on the committee agenda.</div>}
                    <Field label="Rationale (mandatory)"><textarea className="input h-16" value={rationale} onChange={(e) => setRationale(e.target.value)} /></Field></>}
                  {outcome === "sent_back" && <>
                    <Field label="Reason category"><select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>{["new_information", "factual_error", "methodology_question", "other"].map((x) => <option key={x} value={x}>{fmt.label(x)}</option>)}</select></Field>
                    <Field label="Note to Lincoln"><textarea className="input h-28" value={note} onChange={(e) => { setNote(e.target.value); }} /></Field>
                    {ch?.draft_note && <button className="btn-ghost text-brand-700" onClick={() => { setNote(ch.draft_note); setUsedDraft(true); }}>Use TIQ's draft</button>}</>}
                  <button className="btn-primary w-full justify-center" disabled={!outcome} onClick={() => confirm.ask(words, async () => {
                    await api(`/loans/${loanId}/g1`, { body: { outcome, mark: mark ? Number(mark) : null, rationale, reason_category: reason, note, used_tiq_draft: usedDraft, evidence: outcome === "sent_back" ? ch?.evidence : undefined } }); refresh();
                  }, outcome === "sent_back")}>Decide</button>
                </div>)}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}


function InternalValuation({ data, loanId, onDone }: { data: any; loanId: string; onDone: () => void }) {
  const method = data.loan.valuation_method;
  const [point, setPoint] = useState("");
  const [why, setWhy] = useState("");
  const act = useAction();
  if (method === "Lincoln") return <Card title="Pricing panel"><div className="text-sm text-slate-400">No Lincoln valuation yet. It arrives in Box after the package is shared (Q10).</div></Card>;
  return (
    <Card title={`Valuation route: ${method}`} actions={<AssumedChip dq="M7.3" what="valuation method per deal" />}>
      {act.node}
      <div className="mb-3 text-sm text-slate-600">{method === "AB proposal" ? "The Deal Team proposes the mark with its rationale; it then goes through Gate 1 like a Lincoln draft." :
        method === "Sponsor value" ? "The PM Team records the sponsor-reported value with the statement as evidence." :
          "The mark is the Sentry cost basis on funded amount; the PM Team records it."}</div>
      <div className="grid max-w-xl grid-cols-2 gap-3">
        {method !== "Cost" && <Field label="Mark"><input className="input num" value={point} onChange={(e) => setPoint(e.target.value)} /></Field>}
        <div className="col-span-2"><Field label="Rationale"><textarea className="input h-20" value={why} onChange={(e) => setWhy(e.target.value)} placeholder={method === "Cost" ? "Optional for cost" : ""} /></Field></div>
      </div>
      <button className="btn-primary mt-3" onClick={() => act.run(async () => { await api(`/loans/${loanId}/internal-valuation`, { body: { point: point ? Number(point) : null, rationale: why } }); onDone(); })}>Record {method.toLowerCase()} mark</button>
    </Card>
  );
}
