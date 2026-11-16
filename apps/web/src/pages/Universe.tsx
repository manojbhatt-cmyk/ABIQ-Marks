import { useState } from "react";
import { api, fmt, useApi } from "../api";
import { Card, Chip, ErrorState, Loading, PageHeader, useAction } from "../components/ui";
import { useApp } from "../context";

export default function Universe() {
  const { cycle } = useApp();
  const u = useApi<any>(`/universe?period=${cycle?.period || "2026-Q3"}`, [cycle?.id]);
  const loans = useApi<any[]>(cycle ? `/cycles/${cycle.id}/loans` : null, [cycle?.id]);
  const act = useAction();
  const [f, setF] = useState({ sector: "", team: "", rating: "", watchlist: "", method: "" });
  if (u.loading) return <Loading />;
  if (u.error) return <ErrorState error={u.error} retry={u.reload} />;
  const all = u.data.rows;
  const opts = (k: string) => Array.from(new Set(all.map((r: any) => r[k]).filter((x: any) => x !== null && x !== undefined))).sort() as any[];
  const rows = all.filter((r: any) => (!f.sector || r.sector === f.sector) && (!f.team || r.team_name === f.team) &&
    (!f.rating || String(r.previous_rating) === f.rating) && (!f.watchlist || String(!!r.previous_watchlist) === f.watchlist) &&
    (!f.method || r.valuation_method === f.method));
  const scopeById = Object.fromEntries((loans.data || []).map((l: any) => [l.facility_id, l]));
  const inScope = rows.filter((r: any) => (scopeById[r.facility_id]?.in_scope ?? r.in_scope));
  const borrowers = new Set(rows.map((r: any) => r.borrower_id));
  const csv = () => {
    const head = ["facility_id", "borrower", "sponsor", "team_name", "facility_type", "commitment_amount", "funded_amount", "coupon_rate", "maturity_date", "previous_final_mark", "previous_rating", "previous_watchlist", "cmr_type"];
    const blob = new Blob([[head.join(","), ...rows.map((r: any) => head.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n")], { type: "text/csv" });
    window.open(URL.createObjectURL(blob));
  };
  return (
    <>
      <PageHeader title="Loan universe" subtitle={`${rows.length} facilities from ${borrowers.size} borrowers, ${inScope.length} in scope`}
        actions={<><button className="btn-secondary" onClick={() => act.run(async () => { if (cycle) { const r = await api(`/cycles/${cycle.id}/refresh`, { body: {} }); alert(`Refreshed from ${u.data.freshness.source}: ${r.changes.length} change(s), ${r.late_additions.length} late addition(s)`); } u.reload(); loans.reload(); })}>Refresh from Snowflake</button><button className="btn-secondary" onClick={csv}>Export</button></>} />
      {act.node}
      <div className="mb-4 flex flex-wrap gap-2">
        {([["sector", "Sector", opts("sector")], ["team", "Deal team", opts("team_name")], ["rating", "Rating", opts("previous_rating").map(String)],
          ["watchlist", "Watchlist", ["true", "false"]], ["method", "Valuation method", opts("valuation_method")]] as any[]).map(([k, label, o]) => (
          <select key={k} className="input w-48" value={(f as any)[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
            <option value="">{label}: all</option>{o.map((x: string) => <option key={x} value={x}>{k === "watchlist" ? (x === "true" ? "on watchlist" : "not on watchlist") : x}</option>)}
          </select>))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <div className="card overflow-x-auto xl:col-span-3">
          <table className="w-full">
            <thead><tr>{["Facility", "Borrower", "Sector", "Sponsor", "Deal team", "Type", "Commitment", "Funded", "Coupon", "Maturity", "Prev mark", "Prev rating", "Watchlist", "CMR type", "Valuation method", "In scope"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r: any) => {
                const cl = scopeById[r.facility_id];
                const scope = cl ? cl.in_scope : r.in_scope;
                return (
                  <tr key={r.facility_id} className={scope ? "" : "opacity-50"}>
                    <td className="td font-medium">{r.facility_id}</td><td className="td">{r.borrower}</td><td className="td text-xs">{r.sector}</td><td className="td">{r.sponsor}</td>
                    <td className="td">{r.team_name || <Chip tone="red">unowned</Chip>}</td><td className="td">{r.asset_class}{r.seniority === "second_lien" ? " (2L)" : ""}</td>
                    <td className="tdn">{fmt.num(r.commitment_amount)}</td><td className="tdn">{fmt.num(r.funded_amount)}</td><td className="tdn">{fmt.pct(r.coupon_rate, 2)}</td>
                    <td className="td num">{r.maturity_date}</td><td className="tdn">{fmt.mark(r.previous_final_mark)}</td><td className="tdn">{r.previous_rating}</td>
                    <td className="td">{r.previous_watchlist ? <Chip tone="amber">yes</Chip> : "no"}</td><td className="td">{r.cmr_type}</td>
                    <td className="td">{cl ? <select className="rounded border border-canvas-200 bg-white px-1 py-0.5 text-xs" value={cl.valuation_method} onChange={(e) => act.run(async () => {
                      const reason = prompt(`Reason to value ${r.borrower} by ${e.target.value}`); if (!reason) return;
                      await api(`/loans/${cl.id}/valuation-method`, { body: { method: e.target.value, reason } }); loans.reload();
                    })}>{["Lincoln", "AB proposal", "Sponsor value", "Cost"].map((m) => <option key={m}>{m}</option>)}</select> : r.valuation_method}</td>
                    <td className="td">{cl ? <input type="checkbox" checked={scope} onChange={() => act.run(async () => {
                      const reason = prompt(`Reason to mark ${r.borrower} ${scope ? "out of" : "in"} scope`);
                      if (!reason) return;
                      await api(`/loans/${cl.id}/scope`, { body: { in_scope: !scope, reason } }); loans.reload();
                    })} /> : (scope ? "yes" : "no")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Card title="Source freshness">
          <div className="space-y-2 text-sm">
            <div><Chip tone="blue">{u.data.freshness.source}</Chip></div>
            <div>{u.data.freshness.dealcloud}</div><div>Everest via Snowflake, Q2 2026 final marks and ratings</div><div>{u.data.freshness.sentry}</div>
            <div className="text-xs text-slate-400">Revolvers are out of scope by default (assumed, DQ2).</div>
          </div>
        </Card>
      </div>
    </>
  );
}
