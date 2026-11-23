import { BookOpen, CheckCircle2, FileDown, FileText, MessageSquareWarning, PenLine, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, fmt, openFile, useApi } from "../api";
import { AiChip, Card, Chip, Empty, ErrorState, Field, Loading, Modal, Seg, StatusChip, useAction } from "../components/ui";

type Cite = { doc_id?: string; file?: string; page?: number };

function Sources({ cites }: { cites: Cite[] }) {
  const list = (cites || []).filter((c) => c.file);
  if (!list.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Citations:</span>
      {list.map((c, i) => (
        <button
          key={i}
          className="badge badge-gray hover:border-strong transition-colors flex items-center gap-1"
          title={`Open ${c.file} at page ${c.page}`}
          onClick={() => c.doc_id && api(`/documents/${c.doc_id}`).then((d) => openFile(d.url))}
        >
          <FileText size={11} aria-hidden="true" />
          <span>{c.file}{c.page ? ` p.${c.page}` : ""}</span>
        </button>
      ))}
    </div>
  );
}

function ReadView({ data, borrower }: { data: any; borrower?: string }) {
  const c = data.cmr,
    r = data.recommendation || {},
    mb = c.mark_block || {};

  return (
    <article className="card mx-auto max-w-[900px] shadow-sm">
      <header className="border-b border-line px-8 pb-5 pt-7">
        <div className="text-xs font-bold uppercase tracking-wider text-muted">
          Credit Monitoring Review · {fmt.label(c.type)} · v{c.version}
        </div>
        <h2 className="mt-1 text-[22px] font-bold text-ink">{borrower || "Credit Memorandum"}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusChip status={c.status} />
          {c.stage && <span className="badge badge-amber font-semibold">At {fmt.label(c.stage)}</span>}
        </div>
      </header>

      {data.sections.map((s: any, i: number) => {
        const text = s.body || "";
        return (
          <section key={s.id} className="border-b border-line px-8 py-6">
            <h3 className="flex items-baseline gap-3 text-[15px] font-bold text-ink">
              <span className="num text-[13px] font-semibold text-brand-600">{String(i + 1).padStart(2, "0")}</span>
              {s.title}
            </h3>
            {text ? (
              <div className="mt-3 whitespace-pre-wrap pl-7 text-[13.5px] leading-relaxed text-ink font-sans">
                {text}
              </div>
            ) : (
              <div className="mt-3 pl-7 text-xs italic text-muted">Section has not been drafted yet.</div>
            )}
            <div className="pl-7">
              <Sources cites={s.citations} />
            </div>
          </section>
        );
      })}

      <section className="grid gap-6 px-8 py-6 md:grid-cols-2 bg-surface-2/30">
        <div className="rounded-card border border-line bg-surface p-4 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-muted mb-2">Deal Team Recommendation</div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <dt className="text-muted">Internal Rating</dt>
            <dd className="num font-bold text-ink">{r.previous_rating ?? "-"} → {r.proposed_rating ?? "-"}</dd>
            <dt className="text-muted">Watchlist Status</dt>
            <dd className="font-semibold text-ink">{r.watchlist_action || "-"}</dd>
            <dt className="text-muted">Waiver Requested</dt>
            <dd className="font-semibold text-ink">{r.waiver_requested ? `Yes (${r.waiver_conditions || "Standard"})` : "No"}</dd>
            <dt className="text-muted">Expected Direction</dt>
            <dd className="font-semibold text-ink">{r.expected_mark_direction || "-"}</dd>
          </dl>
          {r.rationale && <p className="mt-3 border-t border-line pt-2.5 text-xs text-muted leading-relaxed">{r.rationale}</p>}
        </div>

        <div className="rounded-card border border-line bg-surface p-4 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-muted mb-2">Gate 1 Deal Team Mark</div>
          {mb.mark !== undefined ? (
            <div className="text-[13px] text-ink leading-relaxed">
              Quarter mark: <b className="num font-bold text-brand-700 dark:text-brand-400">{fmt.mark(mb.mark)}</b> · Lincoln range: <span className="num font-medium text-muted">{fmt.mark(mb.range_low)} to {fmt.mark(mb.range_high)}</span>. Approved by <b>{mb.approved_by}</b> ({mb.approved_at?.slice(0, 10)}).
              {mb.committee_mark !== undefined && (
                <div className="mt-2 pt-2 border-t border-line text-xs">
                  Committee mark <b className="num">{fmt.mark(mb.committee_mark)}</b>: {mb.committee_rationale}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted">Populated following Lincoln draft receipt and Gate 1 approval.</div>
          )}
        </div>
      </section>
    </article>
  );
}

export default function CmrEditor({ loanId, onChange }: { loanId: string; onChange: () => void }) {
  const { data, error, loading, reload } = useApi<any>(`/loans/${loanId}/cmr`, [loanId]);
  const docs = useApi<any>(`/loans/${loanId}`, [loanId]);
  const act = useAction();
  const [view, setView] = useState<"edit" | "read">("edit");
  const [sel, setSel] = useState<string>("summary");
  const [text, setText] = useState("");
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [allNote, setAllNote] = useState("");
  const [rec, setRec] = useState<any>({});
  const [findings, setFindings] = useState<any[] | null>(null);

  const cur = data?.sections?.find((s: any) => s.code === sel);

  useEffect(() => {
    setText(cur?.body || "");
    setAsk("");
  }, [cur?.id, cur?.body]);

  useEffect(() => {
    if (data?.recommendation) setRec(data.recommendation);
  }, [data?.recommendation?.id, data?.recommendation?.rationale]);

  if (loading && !data) return <Loading label="Loading Credit Memorandum (CMR)..." />;
  if (error) return <ErrorState error={error} retry={reload} />;

  const refresh = () => {
    reload();
    onChange();
  };

  if (!data) {
    return (
      <Card title="Credit Monitoring Review">
        <Empty
          text="No CMR generated for this quarterly cycle yet"
          hint="Create the document shell, then draft sections using the ABIQ CMR Agent or enter them manually."
          action={
            <button
              className="btn btn-primary"
              onClick={() =>
                act.run(async () => {
                  await api(`/loans/${loanId}/cmr`, { body: {} });
                  refresh();
                })
              }
            >
              Create CMR Document
            </button>
          }
        />
        {act.node}
      </Card>
    );
  }

  const c = data.cmr;
  const editable = c.status === "draft";
  const sug = data.recommendation_suggestion;
  const comments = data.reviews.flatMap((r: any) => r.comments.map((x: any) => ({ ...x, stage: r.stage })));
  const idx = data.sections.findIndex((s: any) => s.code === sel);
  const pending = cur?.pending;

  const redraft = async () => {
    setAsking(true);
    try {
      await act.run(async () => {
        await api(`/cmr-sections/${cur.id}/redraft`, { body: { instruction: ask } });
        setAsk("");
        refresh();
      });
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="space-y-6">
      {act.node}

      {/* Editor Control Toolbar */}
      <div className="card p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Seg
            value={view}
            onChange={(v) => setView(v as any)}
            options={[
              { id: "edit", label: <span className="flex items-center gap-1.5"><PenLine size={13} /> Edit Sections</span> },
              { id: "read", label: <span className="flex items-center gap-1.5"><BookOpen size={13} /> Full Document</span> },
            ]}
          />
          <span className="badge badge-info num font-bold">v{c.version}</span>
          <StatusChip status={c.status} />
          {c.stage && <span className="badge badge-amber font-semibold">At {fmt.label(c.stage)}</span>}
          {data.files.map((f: any) => (
            <span key={f.version} className="badge badge-green font-medium">
              v{f.version} filed ({fmt.date(f.filed_at)})
            </span>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <button className="btn btn-secondary btn-sm gap-1.5" onClick={() => setAllOpen(true)}>
              <Sparkles size={14} className="text-amber-500" />
              <span>Draft All with ABIQ</span>
            </button>
          )}
          <button className="btn btn-secondary btn-sm gap-1.5" onClick={() => openFile(`/api/cmr/${c.id}/pdf`)}>
            <FileDown size={14} />
            <span>Export PDF</span>
          </button>
          {editable && (
            <button
              className="btn btn-primary btn-sm gap-1.5"
              onClick={() =>
                act.run(async () => {
                  const r = await api(`/cmr/${c.id}/submit`, { body: {} });
                  if (!r.submitted) setFindings(r.findings);
                  else refresh();
                })
              }
            >
              <span>Submit for Review</span>
            </button>
          )}
        </div>
      </div>

      {view === "read" ? (
        <ReadView data={data} borrower={docs.data?.loan?.borrower} />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[240px_minmax(0,1fr)_340px] items-start">
          {/* Left: Section Navigation */}
          <nav aria-label="CMR sections" className="card p-2.5 shadow-sm space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted px-2 py-1 mb-1 border-b border-line">
              Memorandum Sections
            </div>
            {data.sections.map((s: any, i: number) => (
              <button
                key={s.id}
                onClick={() => setSel(s.code)}
                aria-current={sel === s.code ? "true" : undefined}
                className={`w-full rounded-control p-2.5 text-left transition-colors flex items-start gap-2.5 ${
                  sel === s.code
                    ? "bg-brand-50/70 dark:bg-brand-950/40 border border-brand-300 dark:border-brand-800"
                    : "hover:bg-surface-2 border border-transparent"
                }`}
              >
                <span
                  className={`num mt-0.5 text-xs font-bold ${
                    sel === s.code ? "text-brand-600" : "text-muted"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`text-[13px] font-semibold truncate ${sel === s.code ? "text-ink" : "text-muted"}`}>
                    {s.title}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.pending ? (
                      <span className="badge badge-amber !text-[9.5px]">
                        {s.pending.kind === "cmr_redraft" ? "Redraft" : "Draft"} ready
                      </span>
                    ) : (
                      <StatusChip status={s.status} />
                    )}
                    {s.comments > 0 && (
                      <span className="badge badge-red !text-[9.5px]">
                        {s.comments} note{s.comments > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </nav>

          {/* Center: Section Editor & AI Assistant */}
          <div className="space-y-6">
            {cur && (
              <Card
                title={
                  <span className="flex items-center gap-2">
                    <span className="num font-bold text-brand-600">{String(idx + 1).padStart(2, "0")}</span>
                    <span>{cur.title}</span>
                  </span>
                }
                actions={
                  <div className="flex items-center gap-2">
                    <StatusChip status={cur.status} />
                    {cur.kept_ratio != null && cur.status !== "ai_draft" && (
                      <span className="text-xs text-muted">
                        from agent draft ({cur.status === "edited" ? "edited" : "accepted"})
                      </span>
                    )}
                  </div>
                }
              >
                {pending && cur.draft && (
                  <div className="mb-4 rounded-card border border-brand-200 bg-brand-50/40 dark:bg-brand-950/30 dark:border-brand-800 p-4 shadow-sm">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AiChip>{pending.kind === "cmr_redraft" ? "ABIQ Redraft" : "ABIQ Draft"}</AiChip>
                        {pending.instruction && (
                          <span className="text-xs text-muted italic">Prompt: "{pending.instruction}"</span>
                        )}
                      </div>
                    </div>
                    {pending.nothing_found && (
                      <div className="mb-2 text-xs font-semibold text-warn-800">
                        No new data detected in package attachments. Add notes manually or upload supporting files.
                      </div>
                    )}
                    <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink font-sans">
                      {cur.draft}
                    </div>
                    {editable && (
                      <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-brand-200/60">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() =>
                            act.run(async () => {
                              await api(`/cmr-sections/${cur.id}`, { body: { action: "accept" } });
                              refresh();
                            })
                          }
                        >
                          Accept Draft
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setText(cur.draft)}>
                          Copy into Editor
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            act.run(async () => {
                              await api(`/cmr-sections/${cur.id}`, { body: { action: "reject" } });
                              refresh();
                            })
                          }
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <textarea
                  className="input min-h-[220px] text-[13.5px] leading-relaxed font-sans"
                  value={text}
                  disabled={!editable}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Draft your analysis for this section or instruct ABIQ to generate it..."
                />

                <Sources cites={cur.citations} />

                {editable && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 pt-2 border-t border-line">
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={text === (cur.body || "")}
                      onClick={() =>
                        act.run(async () => {
                          await api(`/cmr-sections/${cur.id}`, { body: { action: cur.draft ? "edit" : "save", body: text } });
                          refresh();
                        })
                      }
                    >
                      Save Section
                    </button>
                    <button
                      className="btn btn-secondary btn-sm gap-1.5"
                      onClick={() =>
                        act.run(async () => {
                          await api(`/cmr/${c.id}/draft`, { body: { codes: [cur.code] } });
                          refresh();
                        })
                      }
                    >
                      <Sparkles size={13} className="text-amber-500" />
                      <span>Draft with ABIQ</span>
                    </button>
                  </div>
                )}

                {/* Targeted Section Redraft Prompt */}
                {editable && (
                  <div className="mt-5 rounded-card border border-line bg-surface-2/40 p-4">
                    <label htmlFor="tell-tiq" className="flex items-center gap-2 text-xs font-bold text-ink uppercase tracking-wider">
                      <Wand2 size={14} className="text-brand-600" />
                      <span>Instruct ABIQ to Revise Section</span>
                    </label>
                    <p className="mt-1 text-xs text-muted">
                      ABIQ will refine this text incorporating your instruction and referenced documents.
                    </p>
                    <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                      <input
                        id="tell-tiq"
                        className="input flex-1 text-xs"
                        value={ask}
                        onChange={(e) => setAsk(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && ask.trim().length > 3 && !asking && redraft()}
                        placeholder="e.g. emphasize customer renewal milestones and update sponsor covenant equity..."
                      />
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={asking || ask.trim().length < 4}
                        onClick={redraft}
                      >
                        {asking ? "Redrafting..." : "Redraft"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Review Comments Thread */}
                {comments.filter((x: any) => x.section === cur.code).map((x: any) => (
                  <div
                    key={x.id}
                    className={`mt-3 flex items-start gap-2.5 rounded-card border p-3 text-xs ${
                      x.resolved ? "border-line bg-surface text-muted" : "border-danger-200 bg-danger-50/70 text-danger-800"
                    }`}
                  >
                    <MessageSquareWarning size={16} className="mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <b>{fmt.label(x.stage)}:</b> {x.text}{" "}
                      {x.resolved ? (
                        <span className="text-muted">(Resolved: {x.resolution_note})</span>
                      ) : editable || c.status === "filed" ? (
                        <button
                          className="ml-2 underline font-bold text-danger-700"
                          onClick={() =>
                            act.run(async () => {
                              const n = prompt("Resolution note:");
                              if (n) {
                                await api(`/comments/${x.id}/resolve`, { body: { note: n } });
                                refresh();
                              }
                            })
                          }
                        >
                          Resolve
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </div>

          {/* Right: Recommendation & Supporting Findings */}
          <div className="space-y-6">
            {sug && sug.status === "proposed" && (
              <div className="ai-note rounded-card border border-brand-200 bg-brand-50/30 p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <AiChip>ABIQ Suggests</AiChip>
                  <span className="text-xs font-bold text-ink">Proposed Recommendation</span>
                </div>
                <div className="text-[13px] font-semibold text-ink">{sug.payload.text}</div>
                <div className="mt-1 text-xs text-muted">{sug.payload.rationale}</div>
                {editable && (
                  <button
                    className="btn btn-secondary btn-sm mt-3"
                    onClick={() => setRec({ ...rec, ...sug.payload })}
                  >
                    Apply Values
                  </button>
                )}
              </div>
            )}

            <Card title="Deal Team Recommendation" subtitle="Formal credit and rating stance">
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Rating (Prev: ${rec.previous_rating ?? "-"})`}>
                  <select
                    className="input text-xs"
                    disabled={!editable}
                    value={rec.proposed_rating ?? ""}
                    onChange={(e) => setRec({ ...rec, proposed_rating: Number(e.target.value) })}
                  >
                    <option value="">Select rating...</option>
                    {Object.entries(data.rating_labels).map(([k, v]: any) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Watchlist Stance">
                  <select
                    className="input text-xs"
                    disabled={!editable}
                    value={rec.watchlist_action ?? ""}
                    onChange={(e) => setRec({ ...rec, watchlist_action: e.target.value })}
                  >
                    {["", "add", "keep", "remove", "none"].map((x) => (
                      <option key={x} value={x}>
                        {x ? fmt.label(x) : "-"}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Waiver Required">
                  <select
                    className="input text-xs"
                    disabled={!editable}
                    value={rec.waiver_requested ? "yes" : "no"}
                    onChange={(e) => setRec({ ...rec, waiver_requested: e.target.value === "yes" })}
                  >
                    <option value="no">No Waiver</option>
                    <option value="yes">Waiver Requested</option>
                  </select>
                </Field>

                <Field label="Mark Direction">
                  <select
                    className="input text-xs"
                    disabled={!editable}
                    value={rec.expected_mark_direction ?? ""}
                    onChange={(e) => setRec({ ...rec, expected_mark_direction: e.target.value })}
                  >
                    {["", "down", "flat", "up"].map((x) => (
                      <option key={x} value={x}>
                        {x ? fmt.label(x) : "-"}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="mt-3 space-y-3">
                {rec.waiver_requested && (
                  <Field label="Waiver Conditions">
                    <input
                      className="input text-xs"
                      disabled={!editable}
                      value={rec.waiver_conditions ?? ""}
                      onChange={(e) => setRec({ ...rec, waiver_conditions: e.target.value })}
                    />
                  </Field>
                )}
                <Field label="Credit Rationale">
                  <textarea
                    className="input min-h-[90px] text-xs leading-relaxed"
                    disabled={!editable}
                    value={rec.rationale ?? ""}
                    onChange={(e) => setRec({ ...rec, rationale: e.target.value })}
                  />
                </Field>
              </div>

              {editable && (
                <button
                  className="btn btn-primary btn-sm mt-3 w-full justify-center"
                  onClick={() =>
                    act.run(async () => {
                      await api(`/cmr/${c.id}/recommendation`, { method: "PUT", body: rec });
                      refresh();
                    })
                  }
                >
                  Save Recommendation
                </button>
              )}
            </Card>

            <Card title="Attached Evidence" subtitle="Supporting borrower package files">
              <div className="space-y-1.5 text-xs">
                {(docs.data?.documents || []).map((d: any) => {
                  const on = data.evidence.some((e: any) => e.document_id === d.id);
                  return (
                    <label
                      key={d.id}
                      className="flex items-center gap-2 p-1.5 rounded hover:bg-surface-2 transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!editable || on}
                        onChange={() =>
                          act.run(async () => {
                            await api(`/cmr/${c.id}/evidence`, {
                              body: { document_id: d.id, supports: d.doc_type === "sponsor_letter" ? "mitigant" : "recommendation" },
                            });
                            refresh();
                          })
                        }
                      />
                      <span className="truncate flex-1 font-medium">{d.file_name}</span>
                      <span className="badge badge-gray !text-[10px]">{fmt.label(d.doc_type)}</span>
                    </label>
                  );
                })}
              </div>
            </Card>

            <Card title="Review Checker (A3)" subtitle="Pre-flight automated audit checks">
              {(c.findings || []).length ? (
                <ul className="space-y-2 text-xs">
                  {c.findings.map((f: any, i: number) => (
                    <li key={i} className="flex items-start gap-2">
                      <StatusChip status={f.result === "pass" ? "passed" : f.result} />
                      <span className="text-ink">
                        <b>{fmt.label(f.item)}</b>: {f.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-muted">All pre-submission validation checks clear.</div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Modal: Draft All */}
      {allOpen && (
        <Modal
          title="Draft All CMR Sections with ABIQ"
          onClose={() => setAllOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setAllOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={act.busy}
                onClick={() =>
                  act.run(async () => {
                    await api(`/cmr/${c.id}/draft`, { body: { instruction: allNote } });
                    setAllOpen(false);
                    setAllNote("");
                    refresh();
                  })
                }
              >
                {act.busy ? "Drafting with Agents..." : "Start Drafting"}
              </button>
            </>
          }
        >
          <p className="text-xs text-muted leading-relaxed mb-3">
            The CMR Agent will synthesize the verified financial model and borrower documents across all sections. You will be able to review, revise, or discard each individual section before committing.
          </p>
          <Field label="Specific Guidelines or Directives (Optional)">
            <textarea
              className="input h-24 text-xs"
              placeholder="e.g. emphasize customer renewal milestones and evaluate covenant cushion..."
              value={allNote}
              onChange={(e) => setAllNote(e.target.value)}
            />
          </Field>
        </Modal>
      )}

      {/* Modal: Findings Warnings */}
      {findings && (
        <Modal
          title="Pre-Submission Audit Findings"
          onClose={() => setFindings(null)}
          footer={
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setFindings(null)}>
                Revise First
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() =>
                  act.run(async () => {
                    await api(`/cmr/${c.id}/submit`, { body: { acknowledge: true } });
                    setFindings(null);
                    refresh();
                  })
                }
              >
                Acknowledge & Submit
              </button>
            </>
          }
        >
          <ul className="space-y-2 text-xs">
            {findings
              .filter((f) => f.result !== "pass")
              .map((f, i) => (
                <li key={i} className="flex items-start gap-2 p-2 rounded bg-danger-50 border border-danger-200">
                  <StatusChip status={f.result} />
                  <span>
                    <b>{fmt.label(f.item)}</b>: {f.reason}
                  </span>
                </li>
              ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
