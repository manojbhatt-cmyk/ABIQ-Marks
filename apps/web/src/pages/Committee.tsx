import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Play,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { api, fmt, openFile, useApi } from "../api";
import { openAsk } from "../components/AskPanel";
import { MeetingCard, OrganiseMeeting } from "../components/MeetingPanel";
import {
  AiCard,
  AssumedChip,
  Banner,
  Card,
  Chip,
  Empty,
  ErrorState,
  Field,
  Loading,
  PageHeader,
  StatusChip,
  Tabs,
  useAction,
  useConfirm,
} from "../components/ui";
import { useApp } from "../context";

export default function Committee() {
  const { tab = "agenda" } = useParams();
  const { cycle, user } = useApp();
  const nav = useNavigate();
  const { data, error, loading, reload } = useApi<any>(cycle ? `/cycles/${cycle.id}/committee` : null, [cycle?.id]);

  if (!cycle) return <Empty text="No active valuation cycle" />;
  if (!data && !error) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={tab === "meeting" ? "Valuation Committee Meeting" : "Committee Agenda & Pack Builder"}
        ai
        subtitle={
          tab === "meeting"
            ? "Gate 2 Decision Room: the committee chair records formal mark determinations and rationale during the live meeting."
            : "ABIQ screens every loan against 5 governance rules. The PM Team calibrates the agenda, compiles the pack, and convenes the meeting."
        }
      />
      <Tabs
        active={tab}
        onChange={(x) => nav(`/committee/${x}`)}
        tabs={[
          { id: "agenda", label: "Agenda & Pack Builder" },
          { id: "meeting", label: "Live Meeting & Gate G2" },
        ]}
      />
      {tab === "agenda" ? (
        <Agenda data={data} reload={reload} pm={user?.role === "pm_team"} cycleId={cycle.id} />
      ) : (
        <Meeting
          data={data}
          reload={reload}
          canDecide={["committee_member", "committee_chair"].includes(user!.role)}
        />
      )}
    </div>
  );
}

function Agenda({ data, reload, pm, cycleId }: any) {
  const act = useAction();
  const confirm = useConfirm();
  const pack = data.packs[data.packs.length - 1];
  const [cover, setCover] = useState<string | null>(null);

  return (
    <>
      {act.node}
      {confirm.node}

      {/* Agenda Tests Table Card */}
      <Card
        title="Agenda Screening Tests"
        subtitle="Automated screening of portfolio loan marks against quarterly committee governance rules"
        className="mb-6 shadow-sm overflow-hidden"
        actions={
          pm && (data.items || []).some((i: any) => i.decision) ? (
            <span className="text-xs font-semibold text-muted bg-surface-2 px-2.5 py-1 rounded-md border border-line">
              The committee has decided; the agenda is locked.
            </span>
          ) : (
            pm && (
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-secondary btn-sm gap-1.5"
                  onClick={() =>
                    act.run(async () => {
                      await api(`/cycles/${cycleId}/agenda/tests`, { body: {} });
                      reload();
                    })
                  }
                >
                  <Play size={13} />
                  <span>Run Tests</span>
                </button>
                <button
                  className="btn btn-primary btn-sm gap-1.5 font-semibold shadow-xs"
                  onClick={() =>
                    act.run(async () => {
                      await api(`/cycles/${cycleId}/agenda`, { body: {} });
                      reload();
                    })
                  }
                >
                  <Sparkles size={13} />
                  <span>Build Agenda</span>
                </button>
              </div>
            )
          )
        }
      >
        {/* Test Thresholds Chips */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted font-semibold text-[11px] uppercase tracking-wider mr-1">Criteria:</span>
          {data.tests.map((t: any) => (
            <span
              key={t.code}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink border border-line"
            >
              <span>
                {t.label}
                {t.code === "mark_move_10pct" && ` (${(data.threshold.value * 100).toFixed(0)}%)`}
              </span>
              {t.tiq_addition ? <AssumedChip dq="ABIQ addition" /> : <AssumedChip dq="DQ17" />}
            </span>
          ))}
        </div>

        {/* Responsive Table with Inner Overflow Wrapper */}
        <div className="-mx-5 -mb-5 overflow-x-auto border-t border-line">
          <table className="w-full min-w-[940px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-[11px] font-bold uppercase tracking-wider text-ink">
                <th className="py-3 px-4 w-[20%]">Loan</th>
                <th className="py-3 px-3 w-[11%]">Team</th>
                {data.tests.map((t: any) => (
                  <th key={t.code} className="py-3 px-2 text-center text-[10.5px] font-semibold">
                    {t.label}
                  </th>
                ))}
                <th className="py-3 px-3 text-right w-[10%]">Price Move</th>
                <th className="py-3 px-3 text-center w-[12%]">Agenda Status</th>
                {pm && <th className="py-3 px-4 text-right w-[9%]">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {data.grid.map((g: any) => {
                const isOnAgenda = g.on_agenda;
                return (
                  <tr
                    key={g.cycle_loan_id}
                    className={`transition-colors hover:bg-surface-2/60 ${isOnAgenda ? "bg-brand-50/40 dark:bg-brand-950/20" : ""
                      }`}
                  >
                    <td className="py-3 px-4 align-middle">
                      <div className="font-bold text-ink leading-snug">{g.borrower}</div>
                    </td>
                    <td className="py-3 px-3 align-middle text-muted font-medium text-xs">
                      {g.team}
                    </td>
                    {data.tests.map((t: any) => {
                      const flagged = !!g.tests[t.code];
                      return (
                        <td key={t.code} className="py-3 px-2 align-middle text-center">
                          {flagged ? (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-danger-50 text-danger-700 font-bold text-xs border border-danger-200 dark:bg-danger-950/40 dark:border-danger-800">
                              ✓
                            </span>
                          ) : (
                            <span className="text-muted/40 font-mono text-xs">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-3 px-3 align-middle text-right font-mono font-semibold num text-xs">
                      {g.inputs.move !== undefined && g.inputs.move !== null ? fmt.pct(g.inputs.move, 2) : "-"}
                    </td>
                    <td className="py-3 px-3 align-middle text-center">
                      {isOnAgenda ? (
                        <span className="badge badge-brand font-semibold py-0.5 px-2">On Agenda</span>
                      ) : (
                        <span className="badge badge-gray text-[11px] py-0.5 px-2">Not Added</span>
                      )}
                    </td>
                    {pm && (
                      <td className="py-3 px-4 align-middle text-right">
                        {!isOnAgenda && (
                          <button
                            className="btn btn-secondary btn-sm !h-7 !px-2.5 !text-xs font-semibold gap-1 text-brand-700 hover:text-brand-800 shadow-xs"
                            onClick={() =>
                              act.run(async () => {
                                const reason = prompt(`Reason to add ${g.borrower} by hand`);
                                if (reason) {
                                  await api(`/cycles/${cycleId}/agenda/add`, {
                                    body: { cycle_loan_id: g.cycle_loan_id, reason },
                                  });
                                  reload();
                                }
                              })
                            }
                          >
                            <Plus size={12} />
                            <span>Add</span>
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Meeting Status Card */}
      {data.agenda && (
        <div className="mb-6">
          {data.meeting ? (
            <div className="space-y-2">
              <MeetingCard m={data.meeting} />
              {pm && <OrganiseMeeting cycleId={cycleId} existing={data.meeting} onDone={reload} />}
            </div>
          ) : (
            <Card
              title="Committee Meeting"
              actions={pm && <OrganiseMeeting cycleId={cycleId} onDone={reload} />}
              className="shadow-sm"
            >
              <div className="text-sm text-muted">
                Not organised yet.{" "}
                {pm
                  ? "ABIQ drafts the date, time, agenda slots and attendees from this agenda; you check and send the invitation in ABIQ."
                  : "The PM Team organises it once the agenda is built."}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Pack Builder & Agenda Items Columns */}
      {data.agenda && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* Left: Pack Builder (8 cols) */}
          <div className="xl:col-span-8 space-y-4">
            {pack?.stale && (
              <Banner>
                A source document or mark changed after this pack was built. Please rebuild before dispatching to the committee.
              </Banner>
            )}
            <Card
              title={`Committee Pack Builder${pack ? ` (v${pack.version}${pack.sent ? ", Sent" : ""})` : ""}`}
              subtitle="Generates the formal committee evaluation pack with AI one-pagers and challenge highlights."
              actions={
                pm && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        act.run(async () => {
                          await api(`/cycles/${cycleId}/pack`, { body: cover ? { cover_note: cover } : {} });
                          reload();
                        })
                      }
                    >
                      Build Pack
                    </button>
                    {pack && (
                      <button
                        className="btn btn-secondary btn-sm gap-1.5"
                        onClick={() => openFile(`/api/files/sharepoint/${pack.pdf_path}`)}
                      >
                        <ExternalLink size={13} />
                        <span>Preview PDF</span>
                      </button>
                    )}
                    {pack && !pack.sent && (
                      <button
                        className="btn btn-primary btn-sm gap-1.5 shadow-xs"
                        disabled={pack.stale}
                        onClick={() =>
                          confirm.ask(
                            `Send pack v${pack.version} to ${data.members.map((m: any) => m.name).join(", ")}?`,
                            async () => {
                              await api(`/packs/${pack.id}/send`, { body: {} });
                              reload();
                            }
                          )
                        }
                      >
                        <Send size={13} />
                        <span>Send to Committee</span>
                      </button>
                    )}
                  </div>
                )
              }
              className="shadow-sm"
            >
              <Field label="Executive Cover Note" help="Included on the opening page of the committee pack.">
                <textarea
                  className="input h-20 text-xs leading-relaxed"
                  value={cover ?? pack?.cover_note ?? ""}
                  onChange={(e) => setCover(e.target.value)}
                  placeholder="Provide high-level context on market conditions, major mark moves, or specific agenda focus items..."
                />
              </Field>

              <div className="mt-5 space-y-4">
                {(pack?.summaries || []).map((s: any) => (
                  <AiCard key={s.id} title="AI Executive Summary (A6)" confidence={0.85}>
                    <div className="whitespace-pre-wrap text-xs text-ink leading-relaxed">
                      {s.body.replace(/\*\*/g, "")}
                    </div>
                    <div className="mt-3 rounded-control bg-surface-2 p-2.5 text-xs border border-line">
                      <b className="text-ink">Key Committee Questions:</b>{" "}
                      <span className="text-muted">{s.questions.join(" ")}</span>
                    </div>
                  </AiCard>
                ))}
              </div>
            </Card>
          </div>

          {/* Right: Agenda Items (4 cols) */}
          <div className="xl:col-span-4">
            <Card
              title={`Agenda v${data.agenda.version}`}
              subtitle={`Meeting date: ${data.agenda.meeting_date || "Pending"}`}
              className="shadow-sm"
            >
              <div className="space-y-2.5">
                {data.items.map((i: any) => (
                  <div
                    key={i.id}
                    className={`rounded-card border border-line bg-surface p-3 transition-all ${i.removed ? "opacity-40" : "hover:border-brand-300 shadow-xs"
                      }`}
                  >
                    <div className="flex items-center justify-between font-bold text-ink text-xs">
                      <span>{i.borrower}</span>
                      <StatusChip status={i.status} />
                    </div>
                    <div className="text-[11.5px] text-muted mt-1 leading-snug">
                      {i.reasons.map(fmt.label).join(", ")}
                      {i.manual_reason ? `: ${i.manual_reason}` : ""}
                    </div>
                    {pm && !i.removed && i.status === "pending" && (
                      <div className="mt-2 pt-2 border-t border-line/60 flex justify-end">
                        <button
                          className="btn btn-ghost btn-sm !h-6 !px-2 text-danger-600 hover:bg-danger-50 text-[11px]"
                          onClick={() =>
                            act.run(async () => {
                              const reason = prompt("Reason to remove from agenda");
                              if (reason) {
                                await api(`/agenda-items/${i.id}/remove`, { body: { reason } });
                                reload();
                              }
                            })
                          }
                        >
                          <Trash2 size={12} className="mr-1" />
                          <span>Remove</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

const OUTCOME_LABEL: Record<string, string> = {
  approve: "Approve proposed mark",
  change: "Change mark to new value",
  send_back: "Send back for reunderwriting",
  defer: "Defer to later session",
  request_information: "Request additional borrower data",
};

function Meeting({ data, reload, canDecide }: any) {
  const items = (data.items || []).filter((i: any) => !i.removed);
  const [sel, setSel] = useState<string | null>(null);
  const item = items.find((i: any) => i.id === sel) || items.find((i: any) => i.status === "pending") || items[0];
  const pack = data.packs[data.packs.length - 1];
  const summary = pack?.summaries.find((s: any) => s.cycle_loan_id === item?.cycle_loan_id);
  const tr = useApi<any>(item ? `/loans/${item.cycle_loan_id}/pricing` : null, [item?.id]);
  const act = useAction();
  const confirm = useConfirm();
  const [f, setF] = useState<any>({ outcome: "", members_present: data.members.map((m: any) => m.email) });
  const [revising, setRevising] = useState(false);
  const [why, setWhy] = useState("");

  if (!items.length) return <Empty text="No agenda items configured yet" />;

  const v = tr.data?.versions?.[tr.data.versions.length - 1];
  const proposed = tr.data?.decisions?.filter((d: any) => d.outcome !== "sent_back").pop()?.mark ?? v?.point;
  const needR = data.rationale_required_for.includes(f.outcome);
  const words =
    f.outcome === "approve"
      ? `Record APPROVE for ${item.borrower} at the proposed ${proposed?.toFixed(2)}.`
      : f.outcome === "change"
        ? `Record a CHANGE of ${item.borrower}'s mark from ${proposed?.toFixed(2)} to ${Number(f.decided_mark).toFixed(2)}.`
        : `Record ${fmt.label(f.outcome).toUpperCase()} for ${item.borrower}.`;

  return (
    <>
      {act.node}
      {confirm.node}

      {data.meeting ? (
        <div className="mb-4">
          <MeetingCard m={data.meeting} compact />
        </div>
      ) : (
        <div className="mb-4 rounded-control border border-warn-200 bg-warn-50 px-4 py-2.5 text-xs text-warn-800">
          The meeting has not been formally scheduled yet. The PM Team coordinates scheduling from the Agenda tab.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left Column: Agenda Items Selector (2 cols) */}
        <div className="card self-start p-2 xl:col-span-3 shadow-sm">
          <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-line mb-1">
            Agenda Loans ({items.length})
          </div>
          <div className="space-y-1">
            {items.map((i: any) => {
              const isSelected = item.id === i.id;
              return (
                <button
                  key={i.id}
                  onClick={() => {
                    setSel(i.id);
                    setF({ outcome: "", members_present: f.members_present });
                  }}
                  className={`w-full rounded-control px-3 py-2 text-left text-xs transition-all ${isSelected
                    ? "bg-brand-50 text-brand-700 font-semibold ring-1 ring-brand-500/20"
                    : "text-ink hover:bg-surface-2"
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{i.borrower}</span>
                    <StatusChip status={i.status} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Center Column: Loan Review & Pack Summary (5 cols) */}
        <div className="xl:col-span-5 space-y-4">
          <Card
            title={item.borrower}
            actions={
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-ghost btn-sm text-xs"
                  onClick={() => openAsk(`Why is ${item.borrower.split(" ")[0]} on the agenda?`)}
                >
                  Ask ABIQ
                </button>
                <button
                  className="btn btn-secondary btn-sm text-xs gap-1"
                  onClick={() => window.location.assign(`/loans/${item.cycle_loan_id}/cmr`)}
                >
                  <span>Open CMR</span>
                  <ExternalLink size={12} />
                </button>
              </div>
            }
            className="shadow-sm"
          >
            {summary ? (
              <div className="whitespace-pre-wrap text-xs text-ink leading-relaxed">
                {summary.body.replace(/\*\*/g, "")}
              </div>
            ) : (
              <div className="text-xs text-muted">Committee pack not yet built for this loan.</div>
            )}

            {summary && (
              <div className="mt-4 rounded-control bg-brand-50/50 p-3 text-xs border border-brand-200">
                <b className="text-brand-800">Questions raised in committee pack:</b>
                <ul className="ml-4 mt-1.5 list-disc space-y-1 text-brand-900">
                  {summary.questions.map((q: string) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            {item.decision && (
              <div className="mt-4 rounded-control border border-success-200 bg-success-50 p-3 text-xs text-success-800">
                <div className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-success-600" />
                  <span>
                    Recorded: {item.decision.outcome} {fmt.mark(item.decision.decided_mark)}
                  </span>
                </div>
                {item.decision.rationale && (
                  <div className="mt-1 text-success-700">Rationale: {item.decision.rationale}</div>
                )}
                <div className="text-[11px] text-success-600 mt-1">
                  Recorded by {item.decision.recorded_by}
                  {v && item.decision.decided_mark
                    ? ` · Mark ${item.decision.decided_mark.toFixed(2)} is ${item.decision.decided_mark >= v.low && item.decision.decided_mark <= v.high
                      ? "inside"
                      : "outside"
                    } Lincoln range (${v.low.toFixed(2)} to ${v.high.toFixed(2)})`
                    : ""}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Gate G2 Decision Form (4 cols) */}
        <div className="xl:col-span-4">
          <Card
            title="Gate G2 Decision"
            actions={<AssumedChip dq="DQ18" what="committee outcome set" />}
            className="shadow-sm"
          >
            {(item.history || []).length > 0 && (
              <div className="mb-3 space-y-1">
                {item.history.map((h: any, k: number) => (
                  <div
                    key={k}
                    className={`rounded-control px-2.5 py-1 text-[11px] ${k === item.history.length - 1
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-surface-2 text-muted line-through"
                      }`}
                  >
                    {k === item.history.length - 1 ? "Active: " : "Superseded: "}
                    {OUTCOME_LABEL[h.outcome] || h.outcome}
                    {h.decided_mark != null ? ` at ${Number(h.decided_mark).toFixed(2)}` : ""} by{" "}
                    {h.recorded_by.split("@")[0]}
                  </div>
                ))}
              </div>
            )}

            {item.status !== "pending" && canDecide && !revising && (
              <button
                className="btn btn-secondary btn-sm w-full justify-center mb-3"
                onClick={() => {
                  setRevising(true);
                  setF({ outcome: "", members_present: f.members_present });
                  setWhy("");
                }}
              >
                Revise Recorded Decision
              </button>
            )}

            {(item.status !== "pending" && !revising) || !canDecide ? (
              <div className="text-xs text-muted">
                {item.status !== "pending"
                  ? "Formal committee decision has been recorded."
                  : "Only authenticated committee members may record official marks."}
              </div>
            ) : (
              <div className="space-y-3.5 text-xs">
                <div className="rounded-control bg-surface-2 p-2.5 border border-line text-xs">
                  <span className="text-muted">Proposed mark:</span>{" "}
                  <b className="num text-ink">{fmt.mark(proposed)}</b>
                  <span className="mx-2 text-muted">·</span>
                  <span className="text-muted">Lincoln:</span>{" "}
                  <b className="num text-ink">{v ? `${v.low.toFixed(2)} to ${v.high.toFixed(2)}` : "-"}</b>
                </div>

                {/* Outcome Radios */}
                <div className="space-y-1">
                  {data.outcomes.map((o: string) => (
                    <label
                      key={o}
                      className={`flex items-center gap-2 rounded-control px-2.5 py-1.5 cursor-pointer transition-colors ${f.outcome === o
                        ? "bg-brand-50 font-semibold text-brand-700 border border-brand-200"
                        : "hover:bg-surface-2 text-ink"
                        }`}
                    >
                      <input
                        type="radio"
                        checked={f.outcome === o}
                        onChange={() => {
                          const rec = tr.data?.knows?.recommendation;
                          setF({
                            ...f,
                            outcome: o,
                            decided_mark:
                              o === "approve" ? proposed : o === "change" ? "" : f.decided_mark,
                            rating: f.rating ?? rec?.rating ?? null,
                            watchlist_action: f.watchlist_action || rec?.watchlist || "",
                            waiver_decision: f.waiver_decision || (rec?.waiver ? "approved_with_conditions" : ""),
                          });
                        }}
                      />
                      <span>{OUTCOME_LABEL[o] || fmt.label(o)}</span>
                    </label>
                  ))}
                </div>

                {f.outcome === "approve" && (
                  <div className="rounded-control bg-emerald-50 px-3 py-2 text-xs text-emerald-800 border border-emerald-200">
                    The mark is ratified at <b className="num">{fmt.mark(proposed)}</b>.
                  </div>
                )}

                {f.outcome === "change" &&
                  (() => {
                    const nm = Number(f.decided_mark);
                    const ok = f.decided_mark !== "" && !Number.isNaN(nm);
                    const funded = tr.data?.loan?.funded || 0;
                    const impact = ok && proposed != null ? ((funded * (nm - proposed)) / 100) : null;
                    const inside = ok && v ? nm >= v.low && nm <= v.high : null;
                    return (
                      <div className="space-y-2.5 rounded-card border border-brand-200 bg-brand-50/50 p-3">
                        <div className="flex items-end gap-3">
                          <div>
                            <div className="text-[11px] font-semibold text-muted">Proposed</div>
                            <div className="num text-base font-bold text-muted line-through decoration-1">
                              {fmt.mark(proposed)}
                            </div>
                          </div>
                          <span className="pb-1 text-muted">→</span>
                          <div className="flex-1">
                            <Field label="New Final Mark">
                              <input
                                autoFocus
                                className="input num text-base font-bold"
                                placeholder="e.g. 88.5"
                                value={f.decided_mark ?? ""}
                                onChange={(e) => setF({ ...f, decided_mark: e.target.value })}
                              />
                            </Field>
                          </div>
                        </div>
                        {ok && (
                          <div className="space-y-1 text-xs border-t border-brand-200/60 pt-2">
                            <div>
                              Portfolio impact on {fmt.num(funded)}M funded:{" "}
                              <b className={`num ${impact! < 0 ? "text-danger-600" : "text-emerald-600"}`}>
                                {fmt.delta(impact)}
                              </b>
                            </div>
                            {v && (
                              <div>
                                {inside ? (
                                  <span className="badge badge-green">
                                    Inside Lincoln range ({v.low.toFixed(2)} - {v.high.toFixed(2)})
                                  </span>
                                ) : (
                                  <span className="badge badge-warning">
                                    Outside Lincoln range ({v.low.toFixed(2)} - {v.high.toFixed(2)})
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                {f.outcome === "send_back" && (
                  <Field label="Send back to">
                    <select
                      className="input"
                      value={f.send_back_to || "deal_team"}
                      onChange={(e) => setF({ ...f, send_back_to: e.target.value })}
                    >
                      <option value="deal_team">Deal Team</option>
                      <option value="lincoln">Lincoln</option>
                    </select>
                  </Field>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Field label="Rating">
                    <input
                      className="input num"
                      value={f.rating ?? ""}
                      onChange={(e) =>
                        setF({ ...f, rating: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                  </Field>
                  <Field label="Watchlist Action">
                    <select
                      className="input"
                      value={f.watchlist_action ?? ""}
                      onChange={(e) => setF({ ...f, watchlist_action: e.target.value })}
                    >
                      {["", "add", "keep", "remove", "none"].map((x) => (
                        <option key={x} value={x}>
                          {x || "-"}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Waiver Determination">
                  <select
                    className="input"
                    value={f.waiver_decision ?? ""}
                    onChange={(e) => setF({ ...f, waiver_decision: e.target.value })}
                  >
                    {["", "approved_with_conditions", "approved", "rejected", "not_applicable"].map((x) => (
                      <option key={x} value={x}>
                        {fmt.label(x) || "-"}
                      </option>
                    ))}
                  </select>
                </Field>

                {f.waiver_decision?.startsWith("approved") && (
                  <Field label="Approved Conditions">
                    <input
                      className="input"
                      value={f.conditions ?? ""}
                      onChange={(e) => setF({ ...f, conditions: e.target.value })}
                    />
                  </Field>
                )}

                <Field label={`Rationale${needR ? " (Required)" : ""}`}>
                  <textarea
                    className="input h-20 text-xs leading-relaxed"
                    value={f.rationale ?? ""}
                    onChange={(e) => setF({ ...f, rationale: e.target.value })}
                    placeholder="Enter formal justification for committee records..."
                  />
                </Field>

                <Field label="Members Present">
                  <div className="space-y-1 bg-surface-2 p-2 rounded-control border border-line">
                    {data.members.map((m: any) => (
                      <label key={m.email} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={f.members_present.includes(m.email)}
                          onChange={() =>
                            setF({
                              ...f,
                              members_present: f.members_present.includes(m.email)
                                ? f.members_present.filter((x: string) => x !== m.email)
                                : [...f.members_present, m.email],
                            })
                          }
                        />
                        <span>{m.name}</span>
                      </label>
                    ))}
                  </div>
                </Field>

                {revising && (
                  <Field label="Reason for Revision (Required)">
                    <textarea
                      className="input h-16 border-warn-300 text-xs"
                      value={why}
                      onChange={(e) => setWhy(e.target.value)}
                      placeholder="e.g. Committee reconsidered mark following deal lead discussion of EBITDA addbacks"
                    />
                  </Field>
                )}

                <button
                  className="btn btn-primary w-full justify-center gap-1.5 shadow-sm font-semibold"
                  disabled={!f.outcome || (needR && !f.rationale) || (revising && !why)}
                  onClick={() =>
                    confirm.ask(
                      revising ? (
                        <>
                          {words} This revises the earlier decision, which stays in the record. Reason: {why}
                        </>
                      ) : (
                        words
                      ),
                      async () => {
                        const body = { ...f, decided_mark: f.decided_mark ? Number(f.decided_mark) : null };
                        if (revising) await api(`/agenda-items/${item.id}/revise`, { body: { ...body, reason: why } });
                        else await api(`/agenda-items/${item.id}/decision`, { body });
                        setRevising(false);
                        reload();
                      }
                    )
                  }
                >
                  <Check size={14} />
                  <span>{revising ? "Record Revised Decision" : "Record Formal Decision"}</span>
                </button>

                {revising && (
                  <button className="btn btn-ghost w-full justify-center text-xs" onClick={() => setRevising(false)}>
                    Cancel Revision
                  </button>
                )}

                {needR && !f.rationale && (
                  <div className="text-[11.5px] text-danger-600 font-medium">
                    A formal rationale is required for {fmt.label(f.outcome)}.
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
