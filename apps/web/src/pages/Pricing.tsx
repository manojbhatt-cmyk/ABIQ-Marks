import { CheckCircle2, FileText, Info, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { api, fmt, openFile, useApi } from "../api";
import { AssumedChip, Banner, Card, Chip, ErrorState, Field, GateIcon, Loading, useAction, useConfirm } from "../components/ui";
import Challenge from "../components/Challenge";

function RangeBar({
  low,
  high,
  point,
  mark,
  min,
  max,
}: {
  low: number;
  high: number;
  point: number;
  mark?: number | null;
  min: number;
  max: number;
}) {
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div className="relative mt-4 h-10">
      <div className="absolute top-3.5 h-2 w-full rounded-full bg-surface-3" />
      <div
        className="absolute top-3.5 h-2 rounded-full bg-brand-200 dark:bg-brand-900/60"
        style={{ left: pos(low), width: `calc(${pos(high)} - ${pos(low)})` }}
      />
      <div
        className="absolute top-1.5 h-6 w-1.5 rounded-full bg-brand-600 shadow-sm"
        style={{ left: pos(point) }}
        title={`Lincoln Point: ${point}`}
      />
      {mark !== undefined && mark !== null && (
        <div
          className="absolute top-1.5 h-6 w-1.5 rounded-full bg-amber-500 shadow-sm"
          style={{ left: pos(mark) }}
          title={`Approved Mark: ${mark}`}
        />
      )}
      <div className="absolute top-7 text-[11px] font-semibold text-muted num" style={{ left: pos(low) }}>
        {low.toFixed(2)}
      </div>
      <div className="absolute top-7 text-[11px] font-semibold text-muted num" style={{ left: pos(high) }}>
        {high.toFixed(2)}
      </div>
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
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (data?.crosscheck && ry === null) setRy(data.crosscheck.required_yield);
  }, [data?.crosscheck]);

  useEffect(() => {
    if (ry !== null && data)
      api(`/loans/${loanId}/crosscheck?required_yield=${ry}`)
        .then(setCc)
        .catch(() => {});
  }, [ry]);

  if (loading && !data) return <Loading label="Loading Gate 1 Pricing Panel..." />;
  if (error) return <ErrorState error={error} retry={reload} />;

  const refresh = () => {
    reload();
    onChange();
  };

  const v = data.versions[data.versions.length - 1];
  const k = data.knows;
  const decided = data.decisions.filter((d: any) => d.outcome !== "sent_back").pop();
  const waiting = data.loan.status === "waiting_on_lincoln";
  const ch = data.challenge?.payload;
  const qa = data.loan.loops?.QA || 0;
  const m = Number(mark);
  const outside = outcome === "approved_different_mark" && mark && v && (m < v.low || m > v.high);
  const gate = decided && !waiting && data.loan.status !== "sent_back" ? "passed" : data.ready && !waiting ? "open" : "closed";

  const words =
    outcome === "approved"
      ? `You are approving Lincoln's mark of ${v?.point?.toFixed(2)} for ${data.loan.borrower} as the official Deal Team mark.`
      : outcome === "approved_different_mark"
      ? `You are approving ${data.loan.borrower} at ${m.toFixed(2)}, a different mark from Lincoln's ${v?.point?.toFixed(2)}${
          outside ? ", outside Lincoln's valuation range, which places the loan on the Valuation Committee agenda" : ""
        }.`
      : `You are returning ${data.loan.borrower} to Lincoln (version ${v?.version}) with reason category "${fmt.label(reason)}". An audited note will be deposited in Box and dispatched by email.`;

  return (
    <div className="space-y-6">
      {act.node}
      {confirm.node}

      {data.loan.move?.level && (
        <Banner tone={data.loan.move.level === "alert" ? "red" : "amber"}>
          <b>Mark Move Monitor:</b> Current mark is {data.loan.move.mark.toFixed(2)} vs {data.loan.move.previous.toFixed(2)} last quarter ({(data.loan.move.move * 100).toFixed(1)}%).{" "}
          {data.loan.move.level === "alert"
            ? `Move exceeds ${(data.loan.move.alert * 100).toFixed(0)}% alert threshold — automatic Valuation Committee agenda placement.`
            : `Move exceeds ${(data.loan.move.warn * 100).toFixed(0)}% warning threshold. Check valuation drivers.`}
        </Banner>
      )}

      {data.committee_note && (
        <Banner tone="red">
          <b>Valuation Committee Return (Loop QF):</b> {data.committee_note.rationale}
        </Banner>
      )}

      {waiting && (
        <Banner tone="amber">
          <b>Awaiting Revised Lincoln Report (Loop QA ×{qa}):</b> The send-back instruction is archived in Box. Revised valuation will appear automatically upon receipt.
        </Banner>
      )}

      {/* Gate 1 Status Header */}
      <div className="card p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <GateIcon state={gate as any} />
          <div>
            <div className="text-[14px] font-bold text-ink">Gate G1: Deal Team Valuation Approval</div>
            {decided && (
              <div className="text-xs text-muted">
                Passed: <b>{fmt.label(decided.outcome)}</b> ({fmt.mark(decided.mark)}) by {decided.decided_by} ({fmt.date(decided.decided_at)})
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {data.versions.map((x: any) => (
            <span
              key={x.version}
              className={`badge ${x.version === v.version ? "badge-info font-bold" : "badge-gray"} num`}
            >
              Lincoln v{x.version} {x.point.toFixed(2)} ({x.valuation_date})
            </span>
          ))}
        </div>
      </div>

      {!v ? (
        <InternalValuation data={data} loanId={loanId} onDone={refresh} />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 items-start">
          {/* Left Column: Lincoln Version Reports (3 cols) */}
          <div className="space-y-6 xl:col-span-3">
            {data.versions
              .slice()
              .reverse()
              .map((x: any) => (
                <Card
                  key={x.version}
                  title={`Lincoln Valuation v${x.version}`}
                  actions={
                    x.report_document_id && (
                      <button
                        className="btn btn-secondary btn-sm gap-1 !h-[24px] !text-xs"
                        onClick={() => api(`/documents/${x.report_document_id}`).then((d) => openFile(d.url))}
                      >
                        <FileText size={12} />
                        <span>PDF</span>
                      </button>
                    )
                  }
                >
                  <div className="text-[28px] font-bold tracking-tight text-ink num">{x.point.toFixed(2)}</div>
                  <div className="text-xs text-muted mt-0.5">
                    Previous mark: <b className="num text-ink">{fmt.mark(data.loan.previous_mark)}</b> · Req. yield: <b className="num">{fmt.pct(x.yield)}</b>
                  </div>
                  <RangeBar
                    low={x.low}
                    high={x.high}
                    point={x.point}
                    mark={decided?.mark}
                    min={Math.min(x.low, data.loan.previous_mark ?? x.low) - 1.5}
                    max={Math.max(x.high, data.loan.previous_mark ?? x.high) + 1.5}
                  />
                  <div className="mt-5 space-y-2 text-xs border-t border-line pt-3">
                    <div>
                      <span className="font-semibold text-muted block text-[11px] uppercase">Methodology</span>
                      <span className="text-ink">{x.methodology}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-muted block text-[11px] uppercase">Key Assumptions</span>
                      <span className="italic text-muted leading-relaxed">"{x.assumptions}"</span>
                    </div>
                    {x.comments && (
                      <div>
                        <span className="font-semibold text-muted block text-[11px] uppercase">Comments</span>
                        <span className="text-muted">{x.comments}</span>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
          </div>

          {/* Center Column: What Deal Team Knows & Challenge Assistant (5 cols) */}
          <div className="space-y-6 xl:col-span-5">
            <Card title="Deal Team Intelligence & Signals" subtitle="Internal credit memorandum and financial model metrics">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded border border-line bg-surface-2/40">
                  <span className="text-muted block text-[11px]">CMR Recommendation</span>
                  <span className="font-bold text-ink">Rating: {k.recommendation?.previous_rating} → {k.recommendation?.rating}</span>
                  <div className="text-muted mt-0.5">{k.recommendation?.direction}</div>
                </div>
                <div className="p-2.5 rounded border border-line bg-surface-2/40">
                  <span className="text-muted block text-[11px]">Covenant Compliance</span>
                  {k.covenant?.result === "fail" ? (
                    <span className="badge badge-red font-bold">Breached ({fmt.x(k.covenant.actual)} vs {fmt.x(k.covenant.threshold)})</span>
                  ) : (
                    <span className="badge badge-green font-bold">Pass</span>
                  )}
                </div>
                <div className="p-2.5 rounded border border-line bg-surface-2/40">
                  <span className="text-muted block text-[11px]">LTM Adj. EBITDA</span>
                  <span className="font-bold text-ink num">{fmt.num(k.metrics.LTM_ADJ_EBITDA)}</span>
                </div>
                <div className="p-2.5 rounded border border-line bg-surface-2/40">
                  <span className="text-muted block text-[11px]">Total Debt & Leverage</span>
                  <span className="font-bold text-ink num">{fmt.num(k.metrics.TOTAL_DEBT)} · {fmt.x(k.metrics.LEVERAGE)}</span>
                </div>
                {k.sponsor_equity && (
                  <div className="col-span-2 p-2.5 rounded border border-brand-200 bg-brand-50/40 text-xs text-brand-900">
                    <b>Sponsor Support:</b> {k.sponsor_equity.sponsor} committed ${k.sponsor_equity.amount}M ({k.sponsor_equity.date}). Net leverage after equity: <b>{fmt.x(k.net_leverage_after_equity)}</b>.
                  </div>
                )}
              </div>
            </Card>

            <Challenge
              challenge={data.challenge}
              canRun={data.ready && !decided && !waiting}
              running={running}
              onRun={() => {
                setRunning(true);
                act
                  .run(async () => {
                    await api(`/loans/${loanId}/challenge`, { body: {} });
                    refresh();
                  })
                  .finally(() => setRunning(false));
              }}
              onUseNote={(n) => {
                setOutcome("sent_back");
                setNote(n);
                setUsedDraft(true);
                document.getElementById("g1-decision")?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            />

            <Card title="Recorded Gate 1 Decisions">
              {data.decisions.length ? (
                <div className="divide-y divide-line/60 text-xs">
                  {data.decisions.map((d: any) => (
                    <div key={d.id} className="py-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Chip tone={d.outcome === "sent_back" ? "red" : "green"}>{fmt.label(d.outcome)}</Chip>
                          <span className="font-bold text-ink num">v{d.lincoln_version} {d.mark ? fmt.mark(d.mark) : ""}</span>
                        </div>
                        <span className="text-muted">{fmt.date(d.decided_at)}</span>
                      </div>
                      <div className="text-muted">{d.note || d.rationale}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted">No decision recorded yet.</div>
              )}
            </Card>
          </div>

          {/* Right Column: Reunderwriting Guidance, Cross-check & Gate 1 Decision (4 cols) */}
          <div className="space-y-6 xl:col-span-4">
            {data.reunderwriting && (
              <Card title="Market Reunderwriting Guidance" subtitle="September 2026 market underwriting matrix">
                <div className="text-xs font-semibold text-muted">
                  {data.reunderwriting.security} · Band: {data.reunderwriting.band} (${data.reunderwriting.band_range[0]}M–${data.reunderwriting.band_range[1]}M)
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                  <div className="p-2.5 rounded border border-line bg-surface-2/40">
                    <span className="text-muted block text-[11px]">Market Spread</span>
                    <span className="font-bold text-ink num">S+{data.reunderwriting.spread_bps}</span>
                  </div>
                  <div className="p-2.5 rounded border border-line bg-surface-2/40">
                    <span className="text-muted block text-[11px]">Max Leverage</span>
                    <span className="font-bold text-ink num">{fmt.x(data.reunderwriting.max_leverage)}</span>
                  </div>
                </div>
              </Card>
            )}

            <Card title="Indicative Pricing Cross-check" subtitle="Bond pricing formula based on required yield">
              <div className="space-y-2 text-xs">
                {cc && <div className="text-muted">Coupon: {fmt.pct(cc.coupon, 2)} · {cc.years} years to maturity</div>}
                <Field label={`Required Yield: ${ry !== null ? (ry * 100).toFixed(1) : ""}%`}>
                  <input
                    type="range"
                    min={0.06}
                    max={0.25}
                    step={0.0025}
                    value={ry ?? 0.1}
                    onChange={(e) => setRy(Number(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                </Field>
                <div className="text-[24px] font-bold tracking-tight text-ink num pt-1">
                  {cc ? cc.indicative_price.toFixed(2) : "—"}
                </div>
              </div>
            </Card>

            <div id="g1-decision" />
            <Card title="Record Gate 1 Decision" subtitle="Approve Lincoln point, enter alternate mark, or send back" actions={<AssumedChip dq="DQ15" what="approve at a different mark" />}>
              {gate === "passed" ? (
                <div className="p-3 rounded bg-success-50 border border-success-200 text-xs font-semibold text-success-800">
                  Gate G1 Passed. The mark has been signed off and attached to the credit memorandum.
                </div>
              ) : !data.ready ? (
                <div className="text-xs text-muted">
                  G1 opens once the CMR is filed (Step Q8) and Lincoln draft marks are ingested (Step Q12).
                </div>
              ) : (
                <div className="space-y-4 text-xs">
                  <div className="space-y-2">
                    {[
                      ["approved", "Approve (Equal to Lincoln point mark)"],
                      ["approved_different_mark", "Approve at a Different Mark"],
                      ["sent_back", "Send Back to Lincoln with Audit Note"],
                    ].map(([k2, l]) => (
                      <label key={k2} className="flex items-center gap-2 cursor-pointer font-medium text-ink">
                        <input
                          type="radio"
                          name="gate1_outcome"
                          checked={outcome === k2}
                          onChange={() => setOutcome(k2)}
                        />
                        <span>{l}</span>
                      </label>
                    ))}
                  </div>

                  {outcome === "approved_different_mark" && (
                    <div className="space-y-3 pt-2 border-t border-line">
                      <Field label="Proposed Mark">
                        <input className="input num text-xs" value={mark} onChange={(e) => setMark(e.target.value)} placeholder="e.g. 97.50" />
                      </Field>
                      {outside && (
                        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[11.5px] text-amber-800">
                          Mark falls outside Lincoln range ({v.low}–{v.high}). This places the loan on the Committee agenda.
                        </div>
                      )}
                      <Field label="Decision Rationale (Mandatory)">
                        <textarea className="input h-16 text-xs" value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="State credit drivers justifying variance..." />
                      </Field>
                    </div>
                  )}

                  {outcome === "sent_back" && (
                    <div className="space-y-3 pt-2 border-t border-line">
                      <Field label="Reason Category">
                        <select className="input text-xs" value={reason} onChange={(e) => setReason(e.target.value)}>
                          {["new_information", "factual_error", "methodology_question", "other"].map((x) => (
                            <option key={x} value={x}>
                              {fmt.label(x)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Audited Note to Lincoln">
                        <textarea className="input h-24 text-xs font-mono" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Detail discrepancies and request revised valuation..." />
                      </Field>
                      {ch?.draft_note && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setNote(ch.draft_note);
                            setUsedDraft(true);
                          }}
                        >
                          Use ABIQ Challenge Assistant Draft
                        </button>
                      )}
                    </div>
                  )}

                  <button
                    className="btn btn-primary btn-md w-full justify-center text-xs font-semibold"
                    disabled={!outcome}
                    onClick={() =>
                      confirm.ask(
                        words,
                        async () => {
                          await api(`/loans/${loanId}/g1`, {
                            body: {
                              outcome,
                              mark: mark ? Number(mark) : null,
                              rationale,
                              reason_category: reason,
                              note,
                              used_tiq_draft: usedDraft,
                              evidence: outcome === "sent_back" ? ch?.evidence : undefined,
                            },
                          });
                          refresh();
                        },
                        outcome === "sent_back"
                      )
                    }
                  >
                    Commit Gate 1 Decision
                  </button>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function InternalValuation({ data, loanId, onDone }: { data: any; loanId: string; onDone: () => void }) {
  const method = data.loan.valuation_method;
  const [point, setPoint] = useState("");
  const [why, setWhy] = useState("");
  const act = useAction();

  if (method === "Lincoln") {
    return (
      <Card title="Pricing Panel">
        <div className="text-xs text-muted">Awaiting Lincoln draft valuation report in Box.</div>
      </Card>
    );
  }

  return (
    <Card title={`Valuation Route: ${method}`} actions={<AssumedChip dq="M7.3" what="valuation method per deal" />}>
      {act.node}
      <div className="mb-3 text-xs text-muted">
        {method === "AB proposal"
          ? "The Deal Team proposes the mark with supporting rationale; it proceeds through Gate 1 verification."
          : method === "Sponsor value"
          ? "The PM Team records the sponsor-reported valuation with the statement as audit evidence."
          : "The mark is the Sentry cost basis on funded commitment; the PM Team records it directly."}
      </div>
      <div className="grid max-w-xl grid-cols-2 gap-3 text-xs">
        {method !== "Cost" && (
          <Field label="Mark Value">
            <input className="input num text-xs" value={point} onChange={(e) => setPoint(e.target.value)} />
          </Field>
        )}
        <div className="col-span-2">
          <Field label="Valuation Rationale">
            <textarea
              className="input h-20 text-xs"
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              placeholder={method === "Cost" ? "Optional for cost basis" : "Document justification..."}
            />
          </Field>
        </div>
      </div>
      <button
        className="btn btn-primary btn-sm mt-3"
        onClick={() =>
          act.run(async () => {
            await api(`/loans/${loanId}/internal-valuation`, { body: { point: point ? Number(point) : null, rationale: why } });
            onDone();
          })
        }
      >
        Record {method} Mark
      </button>
    </Card>
  );
}
