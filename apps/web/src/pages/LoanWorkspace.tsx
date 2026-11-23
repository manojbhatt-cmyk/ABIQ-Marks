import { ArrowLeft, Clock, Download, FileText, Layers, ShieldCheck } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { downloadFile, fmt, openFile, useApi } from "../api";
import { Card, Chip, ErrorState, Loading, Loops, PageHeader, StatusChip, Tabs } from "../components/ui";
import { DeadlinesCard } from "../components/Reminders";
import CmrEditor from "./CmrEditor";
import LineageView from "./LineageView";
import Pricing from "./Pricing";
import Spread from "./Spread";

export default function LoanWorkspace() {
  const { id, tab = "overview" } = useParams();
  const nav = useNavigate();
  const { data, error, loading, reload } = useApi<any>(`/loans/${id}`, [id, tab]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;

  const l = data.loan;
  const t = data.tracker || {};
  const cov = data.covenant;

  return (
    <div className="space-y-6">
      <PageHeader
        title={l.borrower}
        subtitle={`Facility ${l.facility_id} · ${l.team} · ${fmt.label(l.facility_type)} · Sponsor: ${l.sponsor} · Matures: ${l.maturity}`}
        back={
          <button
            onClick={() => nav("/loans")}
            className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline"
          >
            <ArrowLeft size={13} />
            <span>Back to Loans Inventory</span>
          </button>
        }
      />

      {/* Key Metrics Header Strip */}
      <div className="card p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 items-start">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Commitment / Funded</div>
            <div className="text-[15px] font-bold num text-ink mt-0.5">
              {fmt.num(l.commitment)} / {fmt.num(l.funded)}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Previous Mark</div>
            <div className="text-[15px] font-bold num text-ink mt-0.5">{fmt.mark(l.previous_mark)}</div>
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Quarter Marks Progress</div>
            <div className="flex flex-wrap items-center gap-1 mt-1">
              <span className="badge badge-gray !text-[10px] num" title="Lincoln Draft">
                L {fmt.mark(t.lincoln_draft_mark)}
              </span>
              <span className="badge badge-info !text-[10px] num" title="Deal Team Gate 1">
                DT {fmt.mark(t.deal_team_mark)}
              </span>
              <span className="badge badge-amber !text-[10px] num" title="Committee Decision">
                C {fmt.mark(t.committee_mark)}
              </span>
              <span className="badge badge-green !text-[10px] num" title="Final Dispatched Mark">
                F {fmt.mark(t.final_mark)}
              </span>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Rating & Watchlist</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-bold text-ink num text-[14px]">
                {l.previous_rating} → {t.current_rating ?? l.previous_rating}
              </span>
              {(t.watchlist_flag ?? l.previous_watchlist) ? (
                <span className="badge badge-amber !text-[10px]">Watchlist</span>
              ) : null}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Covenant Test</div>
            <div className="mt-0.5">
              {cov?.result === "fail" ? (
                <span className="badge badge-red !text-[10.5px]">
                  Breached ({fmt.x(cov.actual)} vs {fmt.x(cov.threshold)})
                </span>
              ) : cov?.result ? (
                <span className="badge badge-green !text-[10.5px]">
                  Pass ({fmt.x(cov.actual)} vs {fmt.x(cov.threshold)})
                </span>
              ) : (
                <span className="badge badge-gray !text-[10.5px]">Not Spread</span>
              )}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Stage & Loops</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              <span className="badge badge-info font-bold num !text-[10.5px]">
                Step {String(l.current_step).replace("Q", "")}
              </span>
              <StatusChip status={l.status} />
              <Loops loops={l.loops} />
            </div>
          </div>
        </div>
      </div>

      {/* Workspace Tabs */}
      <Tabs
        active={tab}
        onChange={(x) => nav(`/loans/${id}/${x}`)}
        tabs={[
          { id: "overview", label: "Overview & Audit" },
          { id: "documents", label: "Documents" },
          { id: "spread", label: "Financial Spread" },
          { id: "cmr", label: "Credit Review (CMR)" },
          { id: "pricing", label: "Pricing Panel (G1)" },
          { id: "lineage", label: "Data Lineage" },
        ]}
      />

      {/* Tab 1: Overview */}
      {tab === "overview" && (
        <div className="space-y-6">
          <DeadlinesCard loanId={l.id} />

          <Card
            title={
              <span className="flex items-center gap-2">
                <Clock size={16} className="text-brand-600" /> Loan Governance Timeline & Decision History
              </span>
            }
            subtitle="Full chronological record of automated agent submissions and human approval decisions"
            flush
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-line bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <th className="py-2.5 px-4 w-16">Day</th>
                    <th className="py-2.5 px-3 w-32">Timestamp</th>
                    <th className="py-2.5 px-3 w-40">Actor</th>
                    <th className="py-2.5 px-3 w-36">Role</th>
                    <th className="py-2.5 px-3 w-36">Action</th>
                    <th className="py-2.5 px-4">Audit Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70 text-[12.5px]">
                  {data.timeline.map((e: any) => (
                    <tr key={e.id} className="hover:bg-surface-2 transition-colors">
                      <td className="py-2.5 px-4 num font-bold text-muted">Day {e.day}</td>
                      <td className="py-2.5 px-3 num text-muted">{fmt.date(e.at)}</td>
                      <td className="py-2.5 px-3 font-semibold text-ink">{e.actor}</td>
                      <td className="py-2.5 px-3 text-muted">{fmt.label(e.role)}</td>
                      <td className="py-2.5 px-3">
                        <span className="badge badge-info">{e.action}</span>
                      </td>
                      <td className="py-2.5 px-4 text-muted font-mono text-[11.5px] truncate max-w-md" title={JSON.stringify(e.after)}>
                        {e.after ? JSON.stringify(e.after).slice(0, 120) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Documents */}
      {tab === "documents" && (
        <Card title="Loan Facility Documents" subtitle="Verified borrower packages and external filings">
          <div className="space-y-2">
            {data.documents.map((d: any) => (
              <div
                key={d.id}
                className="flex items-center justify-between p-3 rounded-control border border-line bg-surface-2/30 hover:bg-surface-2 transition-colors text-xs"
              >
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-muted shrink-0" />
                  <button
                    className="font-bold text-ink hover:text-brand-600 hover:underline"
                    onClick={() => openFile(`/api/files/${d.store}/${d.path}`, d.file_name)}
                  >
                    {d.file_name}
                  </button>
                  <button
                    title="Download document"
                    className="text-muted hover:text-brand-600"
                    onClick={() => downloadFile(`/api/files/${d.store}/${d.path}`, d.file_name)}
                  >
                    <Download size={13} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge badge-info">{fmt.label(d.doc_type)}</span>
                  <StatusChip status={d.status === "indexed" ? "done" : d.status} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "spread" && <Spread loanId={id!} onChange={reload} />}
      {tab === "cmr" && <CmrEditor loanId={id!} onChange={reload} />}
      {tab === "pricing" && <Pricing loanId={id!} onChange={reload} />}
      {tab === "lineage" && <LineageView loanId={id!} />}
    </div>
  );
}
