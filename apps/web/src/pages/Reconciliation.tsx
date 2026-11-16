import { api, fmt, useApi } from "../api";
import { AiCard, AssumedChip, Card, Chip, Empty, ErrorState, Kpi, Loading, PageHeader, StatusChip, useAction, useConfirm } from "../components/ui";
import { useApp } from "../context";

export default function Reconciliation() {
  const { cycle } = useApp();
  const { data, error, loading, reload } = useApi<any>(cycle ? `/cycles/${cycle.id}/reconciliation` : null, [cycle?.id]);
  const act = useAction();
  const confirm = useConfirm();
  if (!cycle) return <Empty text="No cycle yet" />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const last = data.runs[data.runs.length - 1];
  const mism = data.items.filter((i: any) => i.status !== "match");
  const sch = data.schedule;
  return (
    <>
      <PageHeader title="Reconciliation" ai subtitle="Checks the final marks against Everest, the CMR ratings and Sentry positions. Every break must be resolved before approval."
        actions={<><AssumedChip dq="DQ19" what="reconciliation sources" /><button className="btn-primary" onClick={() => act.run(async () => { await api(`/cycles/${cycle.id}/reconciliation`, { body: {} }); reload(); })}>Run reconciliation</button></>} />
      {act.node}{confirm.node}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <Kpi label="Run" value={last ? `#${last.run_no}` : "-"} sub={last ? <StatusChip status={last.status} /> : "not run"} />
        <Kpi label="Checks run" value={last?.items ?? 0} />
        <Kpi label="Matches" value={last ? last.items - last.mismatches : 0} tone="green" />
        <Kpi label="Mismatches" value={last?.mismatches ?? 0} tone={last?.mismatches ? "red" : "green"} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8 space-y-4">
          {mism.map((i: any) => (
            <Card key={i.id} title={`${i.borrower}: ${fmt.label(i.check)}`} actions={<StatusChip status={i.status} />}>
              <div className="mb-3 grid grid-cols-2 gap-4 text-sm"><div><div className="label">{i.source_a}</div><div className="text-2xl font-bold num">{i.value_a}</div></div><div><div className="label">{i.source_b}</div><div className="text-2xl font-bold num text-danger-700">{i.value_b}</div></div></div>
              {i.explanation && <AiCard title="Reconciliation Explainer (A7)" confidence={0.85}>{i.explanation}</AiCard>}
              {i.status === "mismatch" ? (
                <div className="mt-3 flex gap-2">
                  <button className="btn-primary" onClick={() => confirm.ask(`Correct ${i.source_b} for ${i.borrower} to ${i.value_a} through the write-back adapter?`, async () => { await api(`/recon-items/${i.id}/resolve`, { body: { action: "corrected_target", note: "Everest updated to the committee mark" } }); reload(); })}>Correct Everest</button>
                  <button className="btn-secondary" onClick={() => act.run(async () => { await api(`/recon-items/${i.id}/resolve`, { body: { action: "corrected_tracker" } }); reload(); })}>Correct tracker</button>
                  <button className="btn-secondary" onClick={() => act.run(async () => { const note = prompt("Explanation"); if (note) { await api(`/recon-items/${i.id}/resolve`, { body: { action: "explained", note } }); reload(); } })}>Explain</button>
                </div>) : <div className="mt-2 text-xs text-slate-500">{fmt.label(i.resolution)} by {i.resolved_by}. Re-run to confirm.</div>}
            </Card>))}
          <Card title="All checks">
            <table className="w-full"><thead><tr>{["Loan", "Check", "Source A", "Value", "Source B", "Value", "Status"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>{data.items.map((i: any) => <tr key={i.id}><td className="td">{i.borrower}</td><td className="td text-xs">{fmt.label(i.check)}</td><td className="td text-xs">{i.source_a}</td><td className="tdn">{i.value_a}</td><td className="td text-xs">{i.source_b}</td><td className="tdn">{i.value_b}</td><td className="td"><StatusChip status={i.status} /></td></tr>)}</tbody></table>
          </Card>
        </div>
        <Card title="Final marks schedule preview" className="xl:col-span-4">
          <div className="mb-2 text-sm">{last?.status === "clean" ? <Chip tone="green">clean: ready for the approval request</Chip> : <Chip tone="amber">becomes the approval request once the run is clean</Chip>}</div>
          <div className="max-h-[480px] overflow-y-auto">{sch.lines.map((l: any) => <div key={l.facility_id} className="flex justify-between border-b border-canvas-100 py-1 text-xs"><span>{l.borrower}</span><span className="num">{fmt.mark(l.mark)} / {fmt.num(l.value, 3)}</span></div>)}</div>
          <div className="mt-3 flex justify-between text-sm font-semibold"><span>Total</span><span className="num">{fmt.m(sch.total)}</span></div>
          <div className="flex justify-between text-sm"><span>Change</span><span className="num">{fmt.delta(sch.delta)}</span></div>
          <div className="flex justify-between text-sm"><span>Story loans (Maple, Harbor, Sunrise)</span><span className="num">{fmt.m(sch.story_total)}</span></div>
        </Card>
      </div>
    </>
  );
}
