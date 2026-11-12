import { useEffect, useState } from "react";
import { api, fmt, ROLE_LABEL, useApi } from "../api";
import { AssumedChip, Card, Chip, ConfirmedChip, Kpi, Loading, PageHeader, StatusChip, Tabs, useAction } from "../components/ui";
import { useApp } from "../context";

const STEPS = ["Q0", ...Array.from({ length: 22 }, (_, i) => `Q${i + 1}`), "M1", "M2", "M3", "M4", "M5", "M6"];

export default function Admin() {
  const [tab, setTab] = useState("rules");
  return (
    <>
      <PageHeader title="Admin" subtitle="Rules, calendar and email templates, connectors, synthetic data, users, agents, evaluation" />
      <Tabs active={tab} onChange={setTab} tabs={["rules", "templates", "connectors", "synthetic", "users", "agents", "evaluation"].map((t) => ({ id: t, label: fmt.label(t).replace(/^\w/, (c) => c.toUpperCase()) }))} />
      {tab === "rules" && <Rules />}{tab === "templates" && <Templates />}{tab === "connectors" && <Connectors />}{tab === "synthetic" && <Synthetic />}
      {tab === "users" && <Users />}{tab === "agents" && <Agents />}{tab === "evaluation" && <Evaluation />}
    </>
  );
}

function Rules() {
  const { data, reload } = useApi<any[]>("/admin/rules", []);
  const act = useAction();
  const { cycle } = useApp();
  if (!data) return <Loading />;
  const current = data.filter((r) => r.current);
  return (
    <div className="card overflow-x-auto">{act.node}
      <table className="w-full"><thead><tr>{["Key", "Value", "Status", "Discovery question", "Version", "Description", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
        <tbody>{current.map((r) => (
          <tr key={r.key}><td className="td font-mono text-xs">{r.key}</td><td className="td font-mono text-xs">{JSON.stringify(r.value)}</td><td className="td">{r.confirmed ? <ConfirmedChip /> : <AssumedChip dq={r.dq} />}</td>
            <td className="td">{r.dq}</td><td className="tdn">v{r.version}{r.reason && <div className="text-[11px] text-slate-400" title={r.reason}>{r.by}</div>}</td><td className="td text-xs text-slate-500">{r.description}</td>
            <td className="td"><button className="btn-secondary" onClick={() => act.run(async () => {
              const v = prompt(`New value for ${r.key} (JSON)`, JSON.stringify(r.value)); if (v === null) return;
              const reason = prompt("Reason for the change (required)"); if (!reason) return;
              await api(`/admin/rules/${r.key}`, { method: "PUT", body: { value: JSON.parse(v), reason } });
              if (r.key.startsWith("agenda.") && cycle && confirm("Re-run the agenda tests now?")) await api(`/cycles/${cycle.id}/agenda/tests`, { body: {} });
              reload();
            })}>Edit</button></td></tr>))}</tbody></table>
    </div>
  );
}

function Templates() {
  const { data } = useApi<any>("/admin/templates", []);
  if (!data) return <Loading />;
  return (
    <div className="grid grid-cols-2 gap-6">
      <Card title="Calendar templates">{data.calendar.map((c: any) => <div key={c.cycle_type + c.phase} className="flex justify-between border-b border-canvas-100 py-1 text-sm"><span>{c.cycle_type} phase {c.phase}: {c.name} ({c.steps.join(", ")})</span><span className="flex gap-2"><span className="num">days {c.start} to {c.end}</span>{c.assumed && <AssumedChip dq="DQ1" />}</span></div>)}</Card>
      <Card title="Email templates">{data.email.map((t: any) => <details key={t.code} className="border-b border-canvas-100 py-1 text-sm"><summary className="cursor-pointer font-medium">{t.code} <span className="text-xs text-slate-400">v{t.version}</span></summary><div className="mt-1 text-xs font-semibold">{t.subject}</div><pre className="whitespace-pre-wrap text-xs text-slate-600">{t.body}</pre></details>)}</Card>
    </div>
  );
}

function Connectors() {
  const { data } = useApi<any>("/admin/connectors", []);
  if (!data) return <Loading />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">{data.connectors.map((c: any, i: number) => <Kpi key={i} label={c.connector} value={<StatusChip status={c.status === "ok" ? "done" : c.status === "configured" ? "in_progress" : "failed"} />} sub={c.root || c.mode || c.account || c.error || ""} />)}</div>
      <Card title={`Write-back adapter: ${data.writeback_mode}`} actions={<span className="text-xs text-slate-500">warehouse {data.warehouse}; last sync {data.last_sync ? `${data.last_sync.dataset} ${fmt.date(data.last_sync.at)}` : "-"}</span>}>
        <table className="w-full"><thead><tr>{["Target", "Key", "Payload", "Before", "Mode", "Status", "By"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>{data.changes.map((w: any) => <tr key={w.id}><td className="td text-xs">{w.target}</td><td className="td font-mono text-[11px]">{JSON.stringify(w.key)}</td><td className="td max-w-xs truncate font-mono text-[11px]" title={JSON.stringify(w.payload)}>{JSON.stringify(w.payload)}</td>
            <td className="td max-w-xs truncate font-mono text-[11px]" title={JSON.stringify(w.before)}>{w.before ? JSON.stringify(w.before).slice(0, 60) : "new row"}</td><td className="td text-xs">{w.mode}</td><td className="td"><StatusChip status={w.status === "applied" ? "done" : w.status} /></td><td className="td text-xs">{w.by}</td></tr>)}</tbody></table>
      </Card>
    </div>
  );
}

function Synthetic() {
  const [until, setUntil] = useState("Q0");
  const [st, setSt] = useState<any>(null);
  const act = useAction();
  const { refreshCycles } = useApp();
  useEffect(() => {
    const t = setInterval(() => api("/admin/synth").then((s) => { setSt(s); }), 1500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (st && !st.running && st.log?.includes("done")) refreshCycles(); }, [st?.running]);
  return (
    <Card title="Synthetic data">{act.node}
      <div className="mb-4 text-sm text-slate-600">Generate and load the synthetic Snowflake schemas, seed the app, and play the demo story to any step. Reset drops and reloads everything.</div>
      <div className="flex items-end gap-2">
        <label><span className="label">Play to step</span><select className="input w-32" value={until} onChange={(e) => setUntil(e.target.value)}>{STEPS.map((s) => <option key={s}>{s}</option>)}</select></label>
        <button className="btn-danger" disabled={st?.running} onClick={() => confirm(`Reset everything and play to ${until}?`) && act.run(() => api("/admin/synth/reset", { body: { until } }))}>Reset and play</button>
        <button className="btn-secondary" disabled={st?.running} onClick={() => act.run(() => api("/admin/synth/play", { body: { until } }))}>Play forward</button>
        {st?.running && <Chip tone="amber">running</Chip>}
      </div>
      {st?.error && <div className="mt-3 rounded bg-danger-100 p-2 text-sm text-danger-700">{st.error}</div>}
      <pre className="mt-4 max-h-80 overflow-y-auto rounded-lg bg-navy-950 p-3 text-xs text-slate-200">{(st?.log || []).join("\n") || "No job run yet"}</pre>
    </Card>
  );
}

function Users() {
  const { data } = useApi<any[]>("/admin/users", []);
  if (!data) return <Loading />;
  return <div className="card"><table className="w-full"><thead><tr>{["Name", "Email", "Role", "Team", "Active"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
    <tbody>{data.map((u) => <tr key={u.email}><td className="td">{u.name}</td><td className="td text-xs">{u.email}</td><td className="td">{ROLE_LABEL[u.role]}</td><td className="td">{u.deal_team_id}</td><td className="td">{u.active ? "yes" : "no"}</td></tr>)}</tbody></table></div>;
}

function Agents() {
  const { data } = useApi<any>("/admin/agents", []);
  if (!data) return <Loading />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <Kpi label="Heavy model" value={<span className="text-base">{data.models.heavy}</span>} sub={data.models.llm_enabled ? "LLM rewrite on" : "deterministic engines (LLM off)"} />
        <Kpi label="Light model" value={<span className="text-base">{data.models.light}</span>} sub={`prompts ${data.models.prompt_version}`} />
        <Kpi label="Model spend this cycle" value={`$${data.cost_total.toFixed(4)}`} />
        <Kpi label="Cost per loan" value={`$${data.cost_per_loan.toFixed(4)}`} sub="target under $2" tone="green" />
      </div>
      <div className="grid grid-cols-3 gap-6">
        <Card title="Runs by component">{data.components.map((c: any) => <div key={c.component} className="flex justify-between border-b border-canvas-100 py-1 text-sm"><span>{c.component}</span><span className="num">{c.runs} runs, {c.tokens} tokens, ${c.cost.toFixed(4)}</span></div>)}</Card>
        <Card title="Suggestions by outcome">{Object.entries(data.suggestions).map(([k, v]: any) => <div key={k} className="flex justify-between py-1 text-sm"><StatusChip status={k} /><span className="num">{v}</span></div>)}</Card>
        <Card title="Recent runs"><div className="max-h-80 overflow-y-auto">{data.recent.map((r: any) => <div key={r.id} className="border-b border-canvas-100 py-1 text-xs"><b>{r.component}</b> {r.graph} <StatusChip status={r.status === "succeeded" ? "done" : r.status} /><div className="text-slate-500">{r.output}</div></div>)}</div></Card>
      </div>
    </div>
  );
}

function Evaluation() {
  const { data, reload } = useApi<any[]>("/admin/evals", []);
  const act = useAction();
  if (!data) return <Loading />;
  const latest = Object.values(data.reduce((acc: any, e: any) => { if (!acc[e.metric]) acc[e.metric] = e; return acc; }, {})) as any[];
  return (
    <Card title="Evaluation on the synthetic eval set" actions={<button className="btn-primary" onClick={() => act.run(async () => { await api("/admin/evals/run", { body: {} }); reload(); })}>Run evaluation</button>}>{act.node}
      <table className="w-full"><thead><tr>{["Metric", "Component", "Value", "Detail", "When"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
        <tbody>{latest.map((e) => <tr key={e.metric}><td className="td font-mono text-xs">{e.metric}</td><td className="td">{e.component}</td><td className="tdn font-semibold">{typeof e.value === "number" && e.value <= 1 && !e.metric.includes("usd") && !e.metric.includes("decisions") ? fmt.pct(e.value, 1) : e.value}</td>
          <td className="td max-w-lg text-xs text-slate-500">{JSON.stringify(e.detail).slice(0, 220)}</td><td className="td text-xs">{fmt.date(e.at)}</td></tr>)}</tbody></table>
    </Card>
  );
}
