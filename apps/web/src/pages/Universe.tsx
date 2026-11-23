import { Download, Filter, Layers, RefreshCw, ShieldCheck } from "lucide-react";
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
  const opts = (k: string) =>
    Array.from(new Set(all.map((r: any) => r[k]).filter((x: any) => x !== null && x !== undefined))).sort() as any[];

  const rows = all.filter(
    (r: any) =>
      (!f.sector || r.sector === f.sector) &&
      (!f.team || r.team_name === f.team) &&
      (!f.rating || String(r.previous_rating) === f.rating) &&
      (!f.watchlist || String(!!r.previous_watchlist) === f.watchlist) &&
      (!f.method || r.valuation_method === f.method)
  );

  const scopeById = Object.fromEntries((loans.data || []).map((l: any) => [l.facility_id, l]));
  const inScope = rows.filter((r: any) => scopeById[r.facility_id]?.in_scope ?? r.in_scope);
  const borrowers = new Set(rows.map((r: any) => r.borrower_id));

  const csv = () => {
    const head = [
      "facility_id", "borrower", "sponsor", "team_name", "facility_type", "commitment_amount",
      "funded_amount", "coupon_rate", "maturity_date", "previous_final_mark", "previous_rating",
      "previous_watchlist", "cmr_type"
    ];
    const blob = new Blob(
      [
        [head.join(","), ...rows.map((r: any) => head.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n"),
      ],
      { type: "text/csv" }
    );
    window.open(URL.createObjectURL(blob));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loan Universe"
        subtitle={`Master loan master universe for ${cycle?.period || "2026-Q3"}. ${rows.length} facilities across ${borrowers.size} borrowers · ${inScope.length} in scope.`}
        actions={
          <div className="flex items-center gap-2">
            <button
              className="btn btn-secondary btn-sm gap-1.5"
              onClick={() =>
                act.run(async () => {
                  if (cycle) {
                    const r = await api(`/cycles/${cycle.id}/refresh`, { body: {} });
                    alert(`Refreshed from ${u.data.freshness.source}: ${r.changes.length} change(s), ${r.late_additions.length} late addition(s)`);
                  }
                  u.reload();
                  loans.reload();
                })
              }
            >
              <RefreshCw size={13} />
              <span>Refresh from Snowflake</span>
            </button>
            <button className="btn btn-secondary btn-sm gap-1.5" onClick={csv}>
              <Download size={13} />
              <span>Export CSV</span>
            </button>
          </div>
        }
      />

      {act.node}

      {/* Freshness Banner */}
      <div className="rounded-card border border-line bg-surface p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="badge badge-info font-bold uppercase tracking-wider">{u.data.freshness.source}</span>
          <span className="text-ink font-semibold">{u.data.freshness.dealcloud}</span>
          <span>·</span>
          <span className="text-muted">{u.data.freshness.sentry}</span>
        </div>
        <div className="text-muted">
          Revolving credit facilities are excluded from quarterly marks by default.
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="card p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-muted">
          <Filter size={13} /> Filter Loan Universe
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {([
            ["sector", "Sector", opts("sector")],
            ["team", "Deal Team", opts("team_name")],
            ["rating", "Rating", opts("previous_rating").map(String)],
            ["watchlist", "Watchlist", ["true", "false"]],
            ["method", "Valuation Method", opts("valuation_method")],
          ] as any[]).map(([k, label, o]) => (
            <div key={k} className="relative">
              <label className="text-[11px] font-semibold text-muted block mb-1">{label}</label>
              <select
                className="input !h-[32px] text-xs"
                value={(f as any)[k]}
                onChange={(e) => setF({ ...f, [k]: e.target.value })}
              >
                <option value="">All {label}s</option>
                {o.map((x: string) => (
                  <option key={x} value={x}>
                    {k === "watchlist" ? (x === "true" ? "On Watchlist" : "Not on Watchlist") : x}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Structured Universe Table (Zero Horizontal Scroll on Desktop) */}
      <div className="card shadow-sm overflow-hidden">
        <div className="hidden md:block overflow-hidden">
          <table className="w-full table-fixed text-left border-collapse">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-[11.5px] font-bold uppercase tracking-wider text-ink">
                <th className="py-2.5 px-4 w-[22%]">Facility & Borrower</th>
                <th className="py-2.5 px-3 w-[16%]">Deal Team & Sector</th>
                <th className="py-2.5 px-3 w-[16%]">Structure & Maturity</th>
                <th className="py-2.5 px-3 w-[16%] text-right">Commitment & Funded</th>
                <th className="py-2.5 px-3 w-[15%] text-right">Previous Mark & Rating</th>
                <th className="py-2.5 px-4 w-[15%] text-right">Valuation & Scope</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70 text-[13px]">
              {rows.map((r: any) => {
                const cl = scopeById[r.facility_id];
                const scope = cl ? cl.in_scope : r.in_scope;
                return (
                  <tr
                    key={r.facility_id}
                    className={`transition-colors hover:bg-surface-2 ${scope ? "" : "opacity-50 bg-surface-2/30"}`}
                  >
                    {/* 1. Facility & Borrower */}
                    <td className="py-3 px-4 align-top">
                      <div className="font-bold text-ink leading-snug">{r.borrower}</div>
                      <div className="text-[11.5px] text-muted mt-0.5">
                        <span className="font-mono text-faint font-semibold">{r.facility_id}</span>
                        {r.sponsor && <span> · {r.sponsor}</span>}
                      </div>
                    </td>

                    {/* 2. Team & Sector */}
                    <td className="py-3 px-3 align-top">
                      <div className="font-semibold text-ink">
                        {r.team_name || <span className="badge badge-red !text-[10px]">Unassigned</span>}
                      </div>
                      <div className="text-[11.5px] text-muted mt-0.5 truncate">{r.sector}</div>
                    </td>

                    {/* 3. Structure & Maturity */}
                    <td className="py-3 px-3 align-top">
                      <div className="font-medium text-ink">
                        {r.asset_class}
                        {r.seniority === "second_lien" && <span className="badge badge-gray ml-1 !text-[10px]">2L</span>}
                      </div>
                      <div className="text-[11.5px] text-muted num mt-0.5">
                        Matures: {r.maturity_date}
                      </div>
                    </td>

                    {/* 4. Commitment & Funded */}
                    <td className="py-3 px-3 align-top text-right">
                      <div className="font-bold num text-ink">{fmt.num(r.commitment_amount)}</div>
                      <div className="text-[11.5px] text-muted num mt-0.5">
                        Funded: {fmt.num(r.funded_amount)} · {fmt.pct(r.coupon_rate, 2)}
                      </div>
                    </td>

                    {/* 5. Previous Mark & Rating */}
                    <td className="py-3 px-3 align-top text-right">
                      <div className="font-bold num text-ink">{fmt.mark(r.previous_final_mark)}</div>
                      <div className="text-[11.5px] text-muted mt-0.5 flex items-center justify-end gap-1.5">
                        <span className="badge badge-gray !py-0 !h-[18px] !text-[10.5px] num">Rating {r.previous_rating}</span>
                        {r.previous_watchlist ? (
                          <span className="badge badge-amber !py-0 !h-[18px] !text-[10.5px]">WL</span>
                        ) : null}
                      </div>
                    </td>

                    {/* 6. Valuation Method & Scope Action */}
                    <td className="py-3 px-4 align-top text-right">
                      <div className="flex items-center justify-end gap-2">
                        {cl ? (
                          <select
                            className="input !h-[26px] !py-0 !px-1.5 text-xs font-semibold"
                            value={cl.valuation_method}
                            onChange={(e) =>
                              act.run(async () => {
                                const reason = prompt(`Reason to value ${r.borrower} by ${e.target.value}:`);
                                if (!reason) return;
                                await api(`/loans/${cl.id}/valuation-method`, { body: { method: e.target.value, reason } });
                                loans.reload();
                              })
                            }
                          >
                            {["Lincoln", "AB proposal", "Sponsor value", "Cost"].map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="badge badge-gray text-xs">{r.valuation_method}</span>
                        )}

                        <label className="flex items-center gap-1 cursor-pointer" title="Toggle loan cycle scope">
                          {cl ? (
                            <input
                              type="checkbox"
                              className="checkbox !h-4 !w-4 rounded"
                              checked={scope}
                              onChange={() =>
                                act.run(async () => {
                                  const reason = prompt(`Reason to mark ${r.borrower} ${scope ? "out of" : "in"} scope:`);
                                  if (!reason) return;
                                  await api(`/loans/${cl.id}/scope`, { body: { in_scope: !scope, reason } });
                                  loans.reload();
                                })
                              }
                            />
                          ) : (
                            <span className="badge badge-info text-xs">{scope ? "In Scope" : "Excluded"}</span>
                          )}
                        </label>
                      </div>
                      <div className="text-[11px] text-muted mt-1">{r.cmr_type}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile / Tablet Cards */}
        <div className="md:hidden divide-y divide-line/70">
          {rows.map((r: any) => {
            const cl = scopeById[r.facility_id];
            const scope = cl ? cl.in_scope : r.in_scope;
            return (
              <div key={r.facility_id} className={`p-4 ${scope ? "" : "opacity-60 bg-surface-2/30"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-ink">{r.borrower}</div>
                    <div className="text-xs text-muted mt-0.5">{r.facility_id} · {r.team_name}</div>
                  </div>
                  <span className={`badge ${scope ? "badge-green" : "badge-gray"}`}>
                    {scope ? "In Scope" : "Out of Scope"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-xs border-t border-line/60 pt-2.5">
                  <div>
                    <span className="text-muted block text-[11px]">Commitment</span>
                    <span className="font-bold num">{fmt.num(r.commitment_amount)}</span>
                  </div>
                  <div>
                    <span className="text-muted block text-[11px]">Prev Mark</span>
                    <span className="font-bold num">{fmt.mark(r.previous_final_mark)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
