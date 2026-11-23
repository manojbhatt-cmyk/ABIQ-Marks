import {
  Building2,
  CheckCircle2,
  Coins,
  Columns,
  Download,
  Filter,
  RefreshCw,
  Send,
  ShieldCheck,
  Table,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmt, useApi } from "../api";
import { AiCard, Card, Chip, Delta, Empty, ErrorState, Kpi, Loading, MoveChip, PageHeader, StatusChip, useAction, useConfirm } from "../components/ui";
import { useApp } from "../context";
import { DeadlinesCard } from "../components/Reminders";

const ALL_COLS = [
  "borrower", "facility", "team", "funded", "previous", "lincoln", "move", "range",
  "deal_team", "committee", "final", "prev_value", "cur_value", "delta",
  "prev_rating", "rating", "watchlist", "waiver", "status", "agenda"
];

const FACILITY_COLS = ["borrower", "facility", "team", "funded"];
const MARK_COLS = ["previous", "lincoln", "move", "range", "deal_team", "committee", "final"];
const VALUE_COLS = ["prev_value", "cur_value", "delta"];
const RISK_COLS = ["prev_rating", "rating", "watchlist", "waiver", "status", "agenda"];

export default function Tracker() {
  const { cycle, user } = useApp();
  const { data, error, loading, reload } = useApi<any>(cycle ? `/cycles/${cycle.id}/tracker` : null, [cycle?.id]);
  const [cols, setCols] = useState<string[]>(ALL_COLS);
  const [filter, setFilter] = useState({ team: "", agenda: false, status: "" });
  const [body, setBody] = useState<string | null>(null);
  const act = useAction();
  const confirm = useConfirm();
  const nav = useNavigate();
  const funds = useApi<any[]>(cycle ? `/cycles/${cycle.id}/tracker/funds` : null, [cycle?.id, data?.kpis?.current]);

  if (!cycle) return <Empty text="No active cycle found" />;
  if (loading && !data) return <Loading label="Loading marks tracker..." />;
  if (error) return <ErrorState error={error} retry={reload} />;

  const k = data.kpis;
  const pm = user?.role === "pm_team";
  const rows = data.rows.filter(
    (r: any) =>
      (!filter.team || r.deal_team === filter.team) &&
      (!filter.agenda || r.agenda_flag) &&
      (!filter.status || r.status === filter.status)
  );
  const draft = data.impacts.find((i: any) => !i.sent_at);

  const download = async () => {
    const b = await api<Blob>(`/cycles/${cycle.id}/tracker.xlsx`);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `marks-tracker-${cycle.period}.xlsx`;
    a.click();
  };

  const show = (c: string) => cols.includes(c);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marks Tracker & Portfolio Synthesis"
        ai
        subtitle="Master valuation registry: tracking previous, Lincoln, deal team, committee, and final marks. Recomputed deterministically on every change."
        actions={
          <div className="flex items-center gap-2">
            <button
              className="btn btn-secondary btn-sm gap-1.5"
              onClick={() =>
                act.run(async () => {
                  await api(`/cycles/${cycle.id}/tracker/recompute`, { body: {} });
                  reload();
                })
              }
            >
              <RefreshCw size={13} />
              <span>Recompute Marks</span>
            </button>
            <button className="btn btn-secondary btn-sm gap-1.5" onClick={download}>
              <Download size={13} />
              <span>Export to Excel</span>
            </button>
          </div>
        }
      />

      {act.node}
      {confirm.node}

      {user?.role === "finance_ir" && cycle.status !== "closed" && (
        <div className="rounded-card border border-warn-200 bg-warn-50/70 p-3.5 text-xs text-warn-800 font-semibold shadow-sm">
          Draft marks status: Marks become final only upon governance sign-off (Gate G3).
        </div>
      )}

      {/* 5 Portfolio KPI Tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi
          label="Previous Portfolio"
          value={fmt.m(k.previous)}
          sub={`All ${data.rows.length} loans`}
        />
        <Kpi
          label="Current Portfolio"
          value={fmt.m(k.current)}
          sub={`${data.rows.filter((r: any) => r.move?.level).length} flagged for big moves`}
        />
        <Kpi
          label="Net Valuation Delta"
          value={<Delta v={k.delta} />}
          tone={k.delta < 0 ? "red" : "green"}
        />
        <Kpi
          label="Draft Marks Loaded"
          value={`${k.draft_marks}/${data.rows.length}`}
          sub={`${Math.round((k.draft_marks / (data.rows.length || 1)) * 100)}% complete`}
        />
        <Kpi
          label="Loans on Agenda"
          value={k.on_agenda}
          sub="Valuation Committee"
          tone={k.on_agenda > 0 ? "amber" : "neutral"}
        />
      </div>

      {/* Full-Width Table Section */}
      <div className="space-y-4">
        {/* Filters & Column Selector */}
        <div className="card p-3 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input !h-[30px] !py-0 text-xs w-36 font-semibold"
              value={filter.team}
              onChange={(e) => setFilter({ ...filter, team: e.target.value })}
            >
              <option value="">All Teams</option>
              {Array.from(new Set(data.rows.map((r: any) => r.deal_team))).map((t: any) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              className="input !h-[30px] !py-0 text-xs w-36 font-semibold"
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
            >
              <option value="">All Statuses</option>
              {Array.from(new Set(data.rows.map((r: any) => r.status))).map((t: any) => (
                <option key={t} value={t}>
                  {fmt.label(t)}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-1.5 font-semibold text-ink cursor-pointer ml-1">
              <input
                type="checkbox"
                className="checkbox !h-3.5 !w-3.5 rounded"
                checked={filter.agenda}
                onChange={(e) => setFilter({ ...filter, agenda: e.target.checked })}
              />
              <span>Committee Agenda Only</span>
            </label>
          </div>

          <details className="relative">
            <summary className="btn btn-secondary btn-sm gap-1.5 cursor-pointer list-none !h-[30px]">
              <Columns size={13} />
              <span>Customize Columns</span>
            </summary>
            <div className="absolute right-0 z-20 mt-1 grid w-64 grid-cols-2 gap-1 rounded-card border border-line bg-surface p-3 text-xs shadow-float">
              {ALL_COLS.map((c) => (
                <label key={c} className="flex items-center gap-1.5 cursor-pointer p-0.5 hover:bg-surface-2 rounded">
                  <input
                    type="checkbox"
                    checked={show(c)}
                    onChange={() => setCols(show(c) ? cols.filter((x) => x !== c) : [...cols, c])}
                  />
                  <span className="truncate">{fmt.label(c)}</span>
                </label>
              ))}
            </div>
          </details>
        </div>

        {/* Master Tracker Table (Full Width with Categorized Group Headers & Sticky Borrower) */}
        <div className="card shadow-sm overflow-hidden border border-line">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                {/* Category Grouping Tier */}
                <tr className="border-b border-line bg-surface-2 text-[10.5px] font-bold uppercase tracking-wider text-ink select-none">
                  {FACILITY_COLS.filter(show).length > 0 && (
                    <th
                      colSpan={FACILITY_COLS.filter(show).length}
                      className="py-2 px-3 border-r border-line text-ink font-bold"
                    >
                      <span className="flex items-center gap-1.5">
                        <Building2 size={13} className="text-brand-600 dark:text-brand-400" />
                        <span className="text-ink font-bold">Facility & Position</span>
                      </span>
                    </th>
                  )}
                  {MARK_COLS.filter(show).length > 0 && (
                    <th
                      colSpan={MARK_COLS.filter(show).length}
                      className="py-2 px-3 border-r border-line bg-brand-50/70 dark:bg-brand-950/40 text-ink font-bold"
                    >
                      <span className="flex items-center gap-1.5">
                        <TrendingUp size={13} className="text-brand-600 dark:text-brand-400" />
                        <span className="text-ink font-bold">Mark Evolution (Price)</span>
                      </span>
                    </th>
                  )}
                  {VALUE_COLS.filter(show).length > 0 && (
                    <th
                      colSpan={VALUE_COLS.filter(show).length}
                      className="py-2 px-3 border-r border-line bg-success-50/70 dark:bg-success-50/20 text-right text-ink font-bold"
                    >
                      <span className="flex items-center justify-end gap-1.5">
                        <Coins size={13} className="text-success-600 dark:text-success-400" />
                        <span className="text-ink font-bold">Portfolio Valuation ($M)</span>
                      </span>
                    </th>
                  )}
                  {RISK_COLS.filter(show).length > 0 && (
                    <th
                      colSpan={RISK_COLS.filter(show).length}
                      className="py-2 px-3 bg-warning-50/70 dark:bg-warning-50/20 text-ink font-bold"
                    >
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck size={13} className="text-warn-600 dark:text-warn-400" />
                        <span className="text-ink font-bold">Risk & Governance</span>
                      </span>
                    </th>
                  )}
                </tr>

                {/* Column Headers Tier */}
                <tr className="border-b border-line bg-surface-2 text-[11px] font-bold uppercase tracking-wider text-ink">
                  {ALL_COLS.filter(show).map((c) => {
                    const isRight = ["funded", "previous", "lincoln", "deal_team", "committee", "final", "prev_value", "cur_value", "delta"].includes(c);
                    const isCenter = ["range", "prev_rating", "rating", "watchlist"].includes(c);
                    const isBorderRight = ["funded", "final", "delta"].includes(c);
                    const isStickyBorrower = c === "borrower";

                    return (
                      <th
                        key={c}
                        className={`py-2.5 px-3 whitespace-nowrap ${isRight ? "text-right" : isCenter ? "text-center" : "text-left"} ${isBorderRight ? "border-r border-line" : ""
                          } ${isStickyBorrower ? "sticky left-0 bg-surface z-20 border-r border-line shadow-xs min-w-[170px]" : ""}`}
                      >
                        {fmt.label(c)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70 text-[12.5px]">
                {rows.map((r: any) => (
                  <tr
                    key={r.id}
                    className="group cursor-pointer transition-colors hover:bg-brand-50/30 dark:hover:bg-brand-950/20"
                    onClick={() => nav(`/loans/${r.cycle_loan_id}`)}
                  >
                    {show("borrower") && (
                      <td className="py-2.5 px-3 font-bold text-ink group-hover:text-brand-600 whitespace-nowrap sticky left-0 bg-surface group-hover:bg-surface-2 z-10 border-r border-line shadow-xs min-w-[170px]">
                        {r.borrower}
                      </td>
                    )}
                    {show("facility") && (
                      <td className="py-2.5 px-3 font-mono text-xs text-muted whitespace-nowrap min-w-[85px]">
                        {r.facility_id}
                      </td>
                    )}
                    {show("team") && (
                      <td className="py-2.5 px-3 text-muted whitespace-nowrap min-w-[95px]">
                        {r.deal_team}
                      </td>
                    )}
                    {show("funded") && (
                      <td className="py-2.5 px-3 text-right num text-muted whitespace-nowrap min-w-[85px] border-r border-line">
                        {fmt.num(r.funded_amount)}
                      </td>
                    )}
                    {show("previous") && (
                      <td className="py-2.5 px-3 text-right num font-medium text-muted whitespace-nowrap min-w-[85px]">
                        {fmt.mark(r.previous_mark)}
                      </td>
                    )}
                    {show("lincoln") && (
                      <td className="py-2.5 px-3 text-right num font-bold text-ink whitespace-nowrap min-w-[95px]">
                        {fmt.mark(r.lincoln_draft_mark)}
                        {r.lincoln_version > 1 && (
                          <span className="ml-1 badge badge-gray !text-[9.5px]">v{r.lincoln_version}</span>
                        )}
                      </td>
                    )}
                    {show("move") && (
                      <td className="py-2.5 px-3 whitespace-nowrap min-w-[125px]">
                        <MoveChip move={r.move} />
                      </td>
                    )}
                    {show("range") && (
                      <td className="py-2.5 px-3 text-center text-muted text-xs num whitespace-nowrap min-w-[110px]">
                        {r.lincoln_range_low ? `${fmt.mark(r.lincoln_range_low)}–${fmt.mark(r.lincoln_range_high)}` : "—"}
                      </td>
                    )}
                    {show("deal_team") && (
                      <td className="py-2.5 px-3 text-right num font-bold text-brand-700 dark:text-brand-400 whitespace-nowrap min-w-[95px]">
                        {r.deal_team_mark != null ? fmt.mark(r.deal_team_mark) : "—"}
                      </td>
                    )}
                    {show("committee") && (
                      <td className="py-2.5 px-3 text-right num font-bold text-amber-600 whitespace-nowrap min-w-[95px]">
                        {r.committee_mark != null ? fmt.mark(r.committee_mark) : "—"}
                      </td>
                    )}
                    {show("final") && (
                      <td className="py-2.5 px-3 text-right num font-extrabold text-emerald-600 whitespace-nowrap min-w-[95px] border-r border-line">
                        {r.final_mark != null ? fmt.mark(r.final_mark) : "—"}
                      </td>
                    )}
                    {show("prev_value") && (
                      <td className="py-2.5 px-3 text-right num text-muted whitespace-nowrap min-w-[95px]">
                        {fmt.num(r.previous_value, 3)}
                      </td>
                    )}
                    {show("cur_value") && (
                      <td className="py-2.5 px-3 text-right num font-semibold text-ink whitespace-nowrap min-w-[95px]">
                        {fmt.num(r.current_value, 3)}
                      </td>
                    )}
                    {show("delta") && (
                      <td className="py-2.5 px-3 text-right whitespace-nowrap min-w-[105px] border-r border-line">
                        <Delta v={r.delta_value} />
                      </td>
                    )}
                    {show("prev_rating") && (
                      <td className="py-2.5 px-3 text-center num text-muted whitespace-nowrap min-w-[80px]">
                        {r.previous_rating || "—"}
                      </td>
                    )}
                    {show("rating") && (
                      <td className="py-2.5 px-3 text-center num font-bold text-ink whitespace-nowrap min-w-[80px]">
                        {r.current_rating || "—"}
                      </td>
                    )}
                    {show("watchlist") && (
                      <td className="py-2.5 px-3 text-center whitespace-nowrap min-w-[85px]">
                        {r.watchlist_flag ? (
                          <span className="badge badge-amber font-semibold">Yes</span>
                        ) : (
                          <span className="text-muted text-xs">No</span>
                        )}
                      </td>
                    )}
                    {show("waiver") && (
                      <td className="py-2.5 px-3 text-xs text-muted whitespace-nowrap min-w-[95px]">
                        {fmt.label(r.waiver_status)}
                      </td>
                    )}
                    {show("status") && (
                      <td className="py-2.5 px-3 whitespace-nowrap min-w-[125px]">
                        <StatusChip status={r.status} />
                      </td>
                    )}
                    {show("agenda") && (
                      <td className="py-2.5 px-3 whitespace-nowrap min-w-[140px]">
                        {r.agenda_flag ? (
                          <span className="badge badge-info !text-[10px] font-semibold">
                            {(r.agenda_reasons_json || []).map(fmt.label).join(", ") || "On Agenda"}
                          </span>
                        ) : (
                          <span className="text-muted text-xs">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3 Balanced, Equal-Height Cards Below Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Card 1: Portfolio Impact Note (A6) */}
        <Card
          title="Portfolio Impact Note (A6)"
          ai
          subtitle="Executive summary of valuation variance"
          className="h-full flex flex-col shadow-sm"
        >
          {draft ? (
            <div className="flex-1 flex flex-col justify-between space-y-3">
              <div className="rounded-card border border-brand-200/80 bg-brand-50/40 dark:bg-brand-950/20 p-3 flex-1 flex flex-col">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-brand-200/60">
                  <span className="text-xs font-bold text-brand-700 dark:text-brand-300">
                    Impact Note Draft v{draft.version}
                  </span>
                  <span className="badge badge-brand !text-[10px] num font-semibold">
                    90% Confidence
                  </span>
                </div>
                <textarea
                  className="input flex-1 min-h-[175px] max-h-[220px] font-mono text-xs leading-relaxed resize-none bg-surface"
                  value={body ?? draft.body}
                  onChange={(e) => setBody(e.target.value)}
                  readOnly={!pm}
                />
              </div>

              {pm && (
                <button
                  className="btn btn-primary btn-sm gap-1.5 w-full justify-center shadow-xs font-semibold"
                  onClick={() =>
                    confirm.ask(
                      `Dispatch Impact Note v${draft.version} (net delta: ${fmt.delta(draft.delta)}) to ${data.recipients.join(", ")}?`,
                      async () => {
                        await api(`/impact/${draft.id}/send`, { body: body !== null ? { body } : {} });
                        setBody(null);
                        reload();
                      }
                    )
                  }
                >
                  <Send size={13} />
                  <span>Send to Stakeholders</span>
                </button>
              )}
            </div>
          ) : pm ? (
            <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 flex-1">
              <p className="text-xs text-muted">
                No draft impact note generated yet. Compile an executive summary based on the latest mark variances.
              </p>
              <button
                className="btn btn-primary btn-sm gap-1.5"
                onClick={() =>
                  act.run(async () => {
                    await api(`/cycles/${cycle.id}/impact`, { body: {} });
                    reload();
                  })
                }
              >
                <Send size={13} />
                <span>Generate Impact Note (A6)</span>
              </button>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-muted flex-1 flex items-center justify-center">
              Impact note draft will appear once generated by the PM Team.
            </div>
          )}
        </Card>

        {/* Card 2: Deadlines */}
        <DeadlinesCard limit={6} className="h-full" />

        {/* Card 3: Portfolio Value by Fund */}
        <Card
          title="Portfolio Value by Fund"
          subtitle="Allocations across fund vehicles"
          className="h-full flex flex-col shadow-sm"
        >
          <div className="flex-1 flex flex-col justify-between">
            <div className="divide-y divide-line/60 text-xs max-h-[260px] overflow-y-auto pr-1">
              {(funds.data || []).map((f: any) => (
                <div key={f.fund} className="flex items-center justify-between py-2.5">
                  <span className="font-semibold text-ink">
                    {f.fund} <span className="text-muted font-normal">({f.loans} loans)</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="num font-bold">{fmt.num(f.current, 3)}</span>
                    <Delta v={f.delta} />
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-2.5 text-xs text-muted border-t border-line/60 mt-2 flex items-center justify-between">
              <span>Total Fund Vehicles: {(funds.data || []).length}</span>
              <span className="font-semibold text-ink num">
                {fmt.m(k.current)} Portfolio
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
