import { api, fmt, openFile, useApi } from "../api";
import { Card, Chip, Empty, ErrorState, Kpi, Loading, PageHeader, useConfirm } from "../components/ui";
import { useApp } from "../context";

export default function Distribution() {
  const { cycle, user, refreshCycles } = useApp();
  const { data, error, loading, reload } = useApi<any>(cycle && user?.role !== "finance_ir" ? `/cycles/${cycle.id}/approvals` : null, [cycle?.id]);
  const inbox = useApi<any[]>("/messages", []);
  const confirm = useConfirm();
  if (!cycle) return <Empty text="No cycle yet" />;
  if (user?.role === "finance_ir") {
    const bundles = (inbox.data || []).filter((m) => m.kind === "distribution" || m.kind === "impact_note");
    return (
      <>
        <PageHeader title="Distribution inbox" subtitle="Final CMRs, marks and impact notes sent to you" />
        <div className="space-y-3">{bundles.length ? bundles.map((m) => <Card key={m.id} title={m.subject} actions={<span className="text-xs text-slate-400">{fmt.date(m.at)}</span>}><div className="whitespace-pre-wrap text-sm">{m.body}</div></Card>) : <Empty text="Nothing received yet" />}</div>
      </>
    );
  }
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const gov = data.governance.find((g: any) => g.status === "signed");
  const groups = [["finance", "Finance", ["Wes Turner", "Justin Park"]], ["investor_relations", "Investor Relations", ["Investor Relations"]], ["deal_teams", "Deal Teams", ["leads and analysts of all six teams"]]];
  return (
    <>
      <PageHeader title="Distribution" subtitle="Q22: send the final CMRs and close the cycle" actions={user?.role === "pm_team" && !data.distribution.length &&
        <button className="btn-primary" disabled={!gov} onClick={() => confirm.ask(`Send the ${cycle.period} final CMRs and marks to Finance, Investor Relations and the Deal Teams, and close the cycle?`, async () => { await api(`/cycles/${cycle.id}/distribute`, { body: {} }); reload(); refreshCycles(); })}>Send and close cycle</button>} />
      {confirm.node}
      {!gov && <div className="mb-4 rounded-lg bg-warn-100 px-4 py-2 text-sm text-warn-700">Distribution opens after governance sign-off (G3).</div>}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Kpi label="Cycle" value={cycle.status === "closed" ? "Closed" : cycle.status} />
        <Kpi label="Final portfolio value" value={fmt.m(data.schedule.total)} sub={`change ${fmt.delta(data.schedule.delta)}`} tone={data.schedule.delta < 0 ? "red" : undefined} />
        <Kpi label="Story loans" value={fmt.m(data.schedule.story_total)} sub={`from ${fmt.m(data.schedule.story_previous)}`} />
      </div>
      <div className="grid grid-cols-3 gap-6">
        {groups.map(([id, name, members]: any) => {
          const sent = data.distribution.find((d: any) => d.group === id);
          return <Card key={id} title={name} actions={sent ? <Chip tone="green">sent {fmt.date(sent.sent_at)}</Chip> : <Chip>not sent</Chip>}>
            <div className="text-sm text-slate-600">{members.join(", ")}</div>
            {sent && <div className="mt-2 max-h-48 overflow-y-auto text-xs">{sent.documents.map((p: string) => <div key={p}><button className="text-info-600 hover:underline" onClick={() => openFile(`/api/files/sharepoint/${p}`)}>{p.split("/").pop()}</button></div>)}</div>}
          </Card>;
        })}
      </div>
    </>
  );
}
