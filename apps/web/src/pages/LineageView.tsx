import { useState } from "react";
import { fmt, useApi } from "../api";
import { Card, Chip, ErrorState, LoopBadge, Loading, Modal } from "../components/ui";

const LABEL: Record<string, string> = { documents: "Documents", spread: "Spread", cmr: "CMR and reviews", lincoln: "Lincoln", g1: "Gate G1",
  agenda: "Agenda tests", committee: "Committee", reconciliation: "Reconciliation", approval: "Written approval (G2)", governance: "Governance (G3)", distribution: "Distribution" };

export default function LineageView({ loanId }: { loanId: string }) {
  const { data, error, loading, reload } = useApi<any>(`/loans/${loanId}/lineage`, [loanId]);
  const [kind, setKind] = useState("");
  const [drawer, setDrawer] = useState<any>(null);
  const audit = useApi<any[]>(drawer ? `/audit?entity_id=${drawer.entity_id}` : null, [drawer?.entity_id]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const nodes = data.nodes.filter((n: any) => !kind || n.kind === kind);
  const csv = () => {
    const blob = new Blob([["kind,title,who,when,detail", ...data.nodes.map((n: any) => [n.kind, n.title, n.who, n.when, n.detail].map((x) => JSON.stringify(x ?? "")).join(","))].join("\n")], { type: "text/csv" });
    window.open(URL.createObjectURL(blob));
  };
  return (
    <Card title={`Mark lineage: ${data.loan.borrower}`} actions={<>
      <select className="input w-44" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All entity types</option>{Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <button className="btn-secondary" onClick={csv}>Export CSV</button></>}>
      <ol className="relative ml-3 border-l-2 border-canvas-200">
        {nodes.map((n: any, i: number) => (
          <li key={i} className="mb-4 ml-5">
            <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-600" />
            <div className="flex flex-wrap items-center gap-2"><Chip tone="blue">{LABEL[n.kind]}</Chip><button className="text-sm font-semibold hover:underline" onClick={() => setDrawer(n)}>{n.title}</button>{n.badge && <LoopBadge code={n.badge} n={1} />}</div>
            <div className="text-xs text-slate-500">{n.who} {n.when ? `on ${fmt.date(n.when)}` : ""}</div>
            {n.detail && <div className="mt-0.5 text-xs text-slate-600">{n.detail}</div>}
          </li>))}
      </ol>
      {drawer && (
        <Modal title={`Audit events: ${drawer.title}`} onClose={() => setDrawer(null)} wide>
          {(audit.data || []).map((e) => <div key={e.id} className="border-b border-canvas-100 py-2 text-xs"><b>{e.action}</b> by {e.actor} ({fmt.label(e.role)}) {fmt.date(e.at)}
            {e.before && <div className="text-slate-500">before: {JSON.stringify(e.before)}</div>}<div className="text-slate-700">after: {JSON.stringify(e.after)}</div></div>)}
          {!audit.data?.length && <div className="text-slate-400">No direct events on this entity.</div>}
        </Modal>)}
    </Card>
  );
}
