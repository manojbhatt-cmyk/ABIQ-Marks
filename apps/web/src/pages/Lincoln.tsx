import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  File,
  FileCode,
  FileSpreadsheet,
  FileText,
  Filter,
  Folder,
  FolderOpen,
  RefreshCw,
  Search,
  Send,
  Upload,
  X,
} from "lucide-react";
import { useState } from "react";
import { api, fmt, openFile, useApi } from "../api";
import { Card, Chip, Empty, ErrorState, Loading, PageHeader, StatusChip, useAction, useConfirm } from "../components/ui";
import { useApp } from "../context";
import { dayDate } from "../display";

export default function Lincoln() {
  const { cycle, user } = useApp();
  const { data, error, loading, reload } = useApi<any>(cycle ? `/cycles/${cycle.id}/lincoln` : null, [cycle?.id]);
  const act = useAction();
  const confirm = useConfirm();
  const [note, setNote] = useState<string | null>(null);

  // Box Gateway state
  const [boxSearch, setBoxSearch] = useState("");
  const [boxFilter, setBoxFilter] = useState<"all" | "inbound" | "outbound">("all");
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [copiedGateway, setCopiedGateway] = useState(false);

  if (!cycle) return <Empty text="No active valuation cycle" />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;

  const external = user?.role === "lincoln";

  const result = (verb: string, n: number, noun: string, where: string, flag: "sharepoint" | "loaded_to_everest") => {
    const latest = data.loans.filter((l: any) => l.valuation_method === "Lincoln").map((l: any) => l.valuations[l.valuations.length - 1]);
    const waiting = latest.filter((v: any) => !v).length;
    const done = latest.filter((v: any) => v && v[flag]).length + n;
    const head = n ? `${verb} ${n} ${noun}${n === 1 ? "" : "s"} ${where}.` : `Nothing new to send ${where}: ${done} already there.`;
    return waiting ? `${head} ${waiting} loan${waiting === 1 ? " is" : "s are"} still waiting for Lincoln's report.` : head;
  };

  if (external) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Lincoln Exchange (External Portal)"
          subtitle="Box workspace: review assigned packages, upload valuation reports and draft marks files, read send-back notes."
        />
        {act.node}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card title="Assigned Packages to Value" className="lg:col-span-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-line bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <th className="py-2.5 px-3">Facility</th>
                    <th className="py-2.5 px-3">Borrower</th>
                    <th className="py-2.5 px-3">Package Manifest</th>
                    <th className="py-2.5 px-3">Send-back Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70 text-[13px]">
                  {data.loans.map((l: any) => (
                    <tr key={l.facility_id} className="hover:bg-surface-2 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-xs">{l.facility_id}</td>
                      <td className="py-2.5 px-3 font-bold text-ink">{l.borrower}</td>
                      <td className="py-2.5 px-3">
                        {l.packages.map((p: any) => (
                          <button
                            key={p.version}
                            className="mr-2 font-semibold text-brand-600 hover:underline"
                            onClick={() => openFile(`/api/files/box/${p.manifest}`)}
                          >
                            v{p.version} manifest
                          </button>
                        ))}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-muted">
                        {l.send_backs.map((n: any, i: number) => (
                          <div key={i} className="mb-1">
                            <button
                              className="font-medium text-ink hover:underline"
                              onClick={() => openFile(`/api/files/box/${n.path}`)}
                            >
                              {n.path.split("/").pop()}
                            </button>
                            : {n.note}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Upload Valuation Report / Marks File">
            <label className="btn btn-primary cursor-pointer w-full justify-center gap-2">
              <Upload size={14} />
              <span>Choose Report File</span>
              <input
                type="file"
                className="hidden"
                onChange={(e) =>
                  e.target.files?.[0] &&
                  act.run(async () => {
                    const f = new FormData();
                    f.append("file", e.target.files![0]);
                    await api(`/lincoln/upload?valuation_date=${new Date().toISOString().slice(0, 10)}`, { form: f });
                    reload();
                  })
                }
              />
            </label>
            <div className="mt-3 text-xs text-muted leading-relaxed">
              Files land in the lincoln-out folder. The PM Team Box watcher synchronizes them automatically into ABIQ.
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const completeCount = data.loans.filter(
    (l: any) => l.valuation_method === "Lincoln" && l.package_status === "complete" && !l.packages.length
  ).length;

  const loanByFacility = new Map<string, string>();
  (data?.loans || []).forEach((l: any) => {
    if (l.facility_id) loanByFacility.set(l.facility_id, l.borrower);
  });

  const handleCopy = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const fullUrl = `${window.location.origin}/api/files/box/${path}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2200);
  };

  const handleCopyGateway = () => {
    const fullUrl = `${window.location.origin}/api/files/box/${cycle.period}/`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedGateway(true);
    setTimeout(() => setCopiedGateway(false), 2200);
  };

  const parsedFiles = (data?.box || []).map((k: string) => {
    const parts = k.split("/");
    const fileName = parts[parts.length - 1] || k;
    const dirPath = parts.slice(0, -1).join("/");
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const isInbound = k.includes("lincoln-out");
    const facilityId = k.match(/F-\d{4}/)?.[0] || null;
    const borrower = facilityId ? loanByFacility.get(facilityId) : null;

    let iconType: "pdf" | "xlsx" | "json" | "file" = "file";
    let badgeColor = "badge-gray";
    let typeLabel = "Document";

    if (ext === "pdf") {
      iconType = "pdf";
      badgeColor = "badge-rose";
      typeLabel = isInbound ? "Lincoln PDF Report" : "Borrower Financials";
    } else if (ext === "xlsx" || ext === "xls") {
      iconType = "xlsx";
      badgeColor = "badge-green";
      typeLabel = "Marks Spreadsheet";
    } else if (ext === "json") {
      iconType = "json";
      badgeColor = "badge-warning";
      typeLabel = "Package Manifest";
    }

    return {
      path: k,
      fileName,
      dirPath,
      ext,
      isInbound,
      facilityId,
      borrower,
      iconType,
      badgeColor,
      typeLabel,
    };
  });

  const inboundCount = parsedFiles.filter((f: any) => f.isInbound).length;
  const outboundCount = parsedFiles.filter((f: any) => !f.isInbound).length;
  const pdfCount = parsedFiles.filter((f: any) => f.ext === "pdf").length;
  const xlsxCount = parsedFiles.filter((f: any) => f.ext === "xlsx" || f.ext === "xls").length;

  const filteredFiles = parsedFiles.filter((f: any) => {
    if (boxFilter === "inbound" && !f.isInbound) return false;
    if (boxFilter === "outbound" && f.isInbound) return false;
    if (boxSearch.trim()) {
      const q = boxSearch.toLowerCase();
      const matchName = f.fileName.toLowerCase().includes(q);
      const matchPath = f.path.toLowerCase().includes(q);
      const matchFacility = f.facilityId?.toLowerCase().includes(q);
      const matchBorrower = f.borrower?.toLowerCase().includes(q);
      const matchExt = f.ext.toLowerCase().includes(q);
      if (!matchName && !matchPath && !matchFacility && !matchBorrower && !matchExt) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lincoln Exchange & Valuation Ingestion"
        ai
        subtitle="Share reporting packages with Lincoln through Box, ingest draft valuation reports as they arrive, load marks to Everest, and archive reports to SharePoint."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {completeCount > 0 && (
              <button
                className="btn btn-primary btn-sm gap-1.5"
                onClick={() =>
                  confirm.ask(
                    `Share ${completeCount} complete package${completeCount === 1 ? "" : "s"} with Lincoln through Box? Each receives an audited manifest listing classified documents.`,
                    async () => {
                      await api(`/cycles/${cycle.id}/lincoln/share-all`, { body: {} });
                      reload();
                    }
                  )
                }
              >
                <Send size={13} />
                <span>Share Complete Packages ({completeCount})</span>
              </button>
            )}

            <button
              className="btn btn-secondary btn-sm gap-1.5"
              onClick={() =>
                act.run(async () => {
                  const r = await api(`/cycles/${cycle.id}/lincoln/ingest`, { body: {} });
                  setNote(r.received ? `Received ${r.received} valuation${r.received === 1 ? "" : "s"} from Lincoln.` : "Nothing new from Lincoln in Box.");
                  reload();
                })
              }
            >
              <RefreshCw size={13} />
              <span>Check Box Files</span>
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() =>
                confirm.ask(
                  "Load the latest Lincoln draft marks for every loan to the Everest pricing panel through the write-back adapter?",
                  async () => {
                    const r = await api(`/cycles/${cycle.id}/lincoln/load-everest`, { body: {} });
                    setNote(result("Loaded", r.loaded, "draft mark", "to Everest", "loaded_to_everest"));
                    reload();
                  }
                )
              }
            >
              Bulk Load to Everest
            </button>

            <button
              className="btn btn-secondary btn-sm"
              disabled={act.busy}
              onClick={() =>
                act.run(async () => {
                  const r = await api(`/cycles/${cycle.id}/lincoln/copy-sharepoint`, { body: {} });
                  setNote(result("Copied", r.copied, "report", "to SharePoint", "sharepoint"));
                  reload();
                })
              }
            >
              Bulk Copy to SharePoint
            </button>
          </div>
        }
      />

      {act.node}
      {confirm.node}

      {note && (
        <div role="status" className="toast mb-4 flex items-center justify-between gap-3 p-3.5 rounded-card border border-success-200 bg-success-50 text-success-800 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-success-600 shrink-0" />
            <span className="text-xs font-semibold">{note}</span>
          </div>
          <button className="icon-btn !h-6 !w-6" onClick={() => setNote(null)}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* Main Loan Table (Structured & Responsive) */}
      <div className="card shadow-sm overflow-hidden">
        <div className="hidden md:block overflow-hidden">
          <table className="w-full table-fixed text-left border-collapse">
            <thead>
              <tr className="border-b border-line bg-surface-2/40 text-[11.5px] font-semibold uppercase tracking-wider text-muted">
                <th className="py-2.5 px-4 w-[22%]">Facility & Borrower</th>
                <th className="py-2.5 px-3 w-[16%]">Package Status</th>
                <th className="py-2.5 px-3 w-[18%]">Lincoln Report</th>
                <th className="py-2.5 px-3 w-[18%] text-right">Point, Range & Yield</th>
                <th className="py-2.5 px-3 w-[14%] text-center">Sync Status</th>
                <th className="py-2.5 px-4 w-[12%] text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70 text-[13px]">
              {data.loans.map((l: any) => {
                const v = l.valuations[l.valuations.length - 1];
                const p = l.packages[l.packages.length - 1];
                return (
                  <tr key={l.cycle_loan_id} className="hover:bg-surface-2 transition-colors">
                    {/* 1. Borrower & Facility */}
                    <td className="py-3 px-4 align-top">
                      <div className="font-bold text-ink leading-snug">{l.borrower}</div>
                      <div className="text-[11.5px] text-muted num font-mono">{l.facility_id}</div>
                    </td>

                    {/* 2. Package Status */}
                    <td className="py-3 px-3 align-top">
                      {l.valuation_method !== "Lincoln" ? (
                        <span className="badge badge-info">{l.valuation_method}</span>
                      ) : p ? (
                        <div>
                          <span className="badge badge-green">Shared v{p.version}</span>
                          <div className="text-[11px] text-muted num mt-0.5">{dayDate(p.day)}</div>
                        </div>
                      ) : (
                        <StatusChip status={l.package_status} />
                      )}
                    </td>

                    {/* 3. Lincoln Report */}
                    <td className="py-3 px-3 align-top">
                      {v ? (
                        <div>
                          <button
                            className="font-semibold text-brand-600 hover:underline flex items-center gap-1"
                            onClick={() => v.report_document_id && api(`/documents/${v.report_document_id}`).then((d) => openFile(d.url))}
                          >
                            <FileText size={13} />
                            <span>v{v.version} · {v.valuation_date}</span>
                          </button>
                          {l.valuations.length > 1 && (
                            <span className="text-[10.5px] text-muted block mt-0.5">Revised post send-back</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted text-xs">Awaiting Report</span>
                      )}
                    </td>

                    {/* 4. Point, Range & Yield */}
                    <td className="py-3 px-3 align-top text-right">
                      {v ? (
                        <div>
                          <div className="font-bold num text-ink">{fmt.mark(v.point)}</div>
                          <div className="text-[11px] text-muted num">
                            {fmt.mark(v.low)} – {fmt.mark(v.high)} · {fmt.pct(v.yield)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>

                    {/* 5. Sync Status (Everest & SharePoint) */}
                    <td className="py-3 px-3 align-top text-center">
                      {v ? (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1">
                            <span className={`badge !py-0 !h-[18px] !text-[10px] ${v.loaded_to_everest ? "badge-green" : "badge-gray"}`}>
                              {v.loaded_to_everest ? "Everest" : "No Everest"}
                            </span>
                            <span className={`badge !py-0 !h-[18px] !text-[10px] ${v.sharepoint ? "badge-green" : "badge-gray"}`}>
                              {v.sharepoint ? "SharePoint" : "No SP"}
                            </span>
                          </div>
                          {v.discrepancy && (
                            <span className="badge badge-red !py-0 !h-[18px] !text-[10px]" title={v.discrepancy_note}>
                              Discrepancy
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>

                    {/* 6. Action */}
                    <td className="py-3 px-4 align-top text-right">
                      {!p && l.valuation_method === "Lincoln" && l.package_status === "complete" && (
                        <button
                          className="btn btn-primary btn-sm !h-[26px] !text-xs font-semibold"
                          onClick={() =>
                            confirm.ask(
                              `Share ${l.borrower}'s package with Lincoln through Box? The manifest lists every classified document.`,
                              async () => {
                                await api(`/loans/${l.cycle_loan_id}/share`, { body: {} });
                                reload();
                              }
                            )
                          }
                        >
                          Share
                        </button>
                      )}
                      {l.send_backs.length > 0 && (
                        <span className="text-[11px] text-danger-600 font-semibold block mt-1">
                          {l.send_backs.length} send-back{l.send_backs.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile / Tablet View */}
        <div className="md:hidden divide-y divide-line/70">
          {data.loans.map((l: any) => {
            const v = l.valuations[l.valuations.length - 1];
            return (
              <div key={l.cycle_loan_id} className="p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-ink">{l.borrower}</div>
                    <div className="text-xs text-muted font-mono">{l.facility_id}</div>
                  </div>
                  {v ? <span className="font-bold num text-ink">{fmt.mark(v.point)}</span> : <span className="text-xs text-muted">Awaiting</span>}
                </div>
                <div className="flex gap-2 text-xs">
                  <StatusChip status={l.package_status} />
                  {v?.loaded_to_everest && <span className="badge badge-green">Everest Loaded</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Supporting Sections: Redesigned Box Files Gateway + Extraction Exceptions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left (2 cols): Active Box Files Gateway */}
        <div className="lg:col-span-2">
          <Card
            title={
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400">
                  <FolderOpen size={17} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span>Active Box Gateway & Shared Documents</span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live Gateway
                    </span>
                  </div>
                </div>
              </div>
            }
            subtitle="Secure document exchange gateway between deal teams, borrower packages, and Lincoln valuation reports."
            actions={
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-secondary btn-sm !h-7 !px-2.5 gap-1.5 text-xs"
                  onClick={handleCopyGateway}
                  title="Copy root Box folder path"
                >
                  {copiedGateway ? (
                    <>
                      <Check size={12} className="text-success-600" />
                      <span className="font-semibold text-success-700">Gateway Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>Copy Box Folder Link</span>
                    </>
                  )}
                </button>
              </div>
            }
            className="shadow-sm"
          >
            {/* Filter and Search Bar */}
            <div className="mb-4 space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {/* Direction Filter Pills */}
                <div className="flex items-center gap-1.5 bg-surface-2 p-1 rounded-control border border-line">
                  <button
                    onClick={() => setBoxFilter("all")}
                    className={`px-3 py-1 rounded-[6px] text-xs font-semibold transition-all ${boxFilter === "all"
                      ? "bg-surface text-ink shadow-xs"
                      : "text-muted hover:text-ink"
                      }`}
                  >
                    All Files ({parsedFiles.length})
                  </button>
                  <button
                    onClick={() => setBoxFilter("inbound")}
                    className={`px-3 py-1 rounded-[6px] text-xs font-semibold transition-all flex items-center gap-1.5 ${boxFilter === "inbound"
                      ? "bg-surface text-ink shadow-xs"
                      : "text-muted hover:text-ink"
                      }`}
                  >
                    <ArrowDownRight size={13} className="text-info-600" />
                    <span>Lincoln Returns ({inboundCount})</span>
                  </button>
                  <button
                    onClick={() => setBoxFilter("outbound")}
                    className={`px-3 py-1 rounded-[6px] text-xs font-semibold transition-all flex items-center gap-1.5 ${boxFilter === "outbound"
                      ? "bg-surface text-ink shadow-xs"
                      : "text-muted hover:text-ink"
                      }`}
                  >
                    <ArrowUpRight size={13} className="text-brand-600" />
                    <span>Borrower Packages ({outboundCount})</span>
                  </button>
                </div>

                {/* Search Input */}
                <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    value={boxSearch}
                    onChange={(e) => setBoxSearch(e.target.value)}
                    placeholder="Search file, facility, format..."
                    className="input !h-8 !pl-8 !text-xs w-full"
                  />
                  {boxSearch && (
                    <button
                      onClick={() => setBoxSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Files List */}
            {filteredFiles.length === 0 ? (
              <div className="flex min-h-[160px] flex-col items-center justify-center rounded-control border border-dashed border-line p-6 text-center">
                <FolderOpen size={28} className="text-muted/60 mb-2" />
                <div className="text-xs font-semibold text-ink">No files match your filter</div>
                <p className="text-[11.5px] text-muted mt-1 max-w-sm">
                  {boxSearch
                    ? `No Box files matching "${boxSearch}". Try a different facility ID or keyword.`
                    : "No files found for the selected category."}
                </p>
                {(boxSearch || boxFilter !== "all") && (
                  <button
                    className="btn btn-secondary btn-sm mt-3 !h-7 !text-xs"
                    onClick={() => {
                      setBoxSearch("");
                      setBoxFilter("all");
                    }}
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {filteredFiles.map((file: any) => {
                  const isCopied = copiedPath === file.path;

                  return (
                    <div
                      key={file.path}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-card border border-line bg-surface hover:bg-surface-2/70 hover:border-brand-300 dark:hover:border-brand-800 transition-all shadow-xs"
                    >
                      {/* Left: Icon & Meta */}
                      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                        {/* Extension-specific visual badge icon */}
                        <div
                          className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 border transition-transform group-hover:scale-105 ${file.iconType === "pdf"
                            ? "bg-rose-50 text-rose-600 border-rose-200/80 dark:bg-rose-950/40 dark:border-rose-900/60"
                            : file.iconType === "xlsx"
                              ? "bg-emerald-50 text-emerald-600 border-emerald-200/80 dark:bg-emerald-950/40 dark:border-emerald-900/60"
                              : file.iconType === "json"
                                ? "bg-amber-50 text-amber-600 border-amber-200/80 dark:bg-amber-950/40 dark:border-amber-900/60"
                                : "bg-surface-2 text-ink border-line"
                            }`}
                        >
                          {file.iconType === "pdf" && <FileText size={17} strokeWidth={2.2} />}
                          {file.iconType === "xlsx" && <FileSpreadsheet size={17} strokeWidth={2.2} />}
                          {file.iconType === "json" && <FileCode size={17} strokeWidth={2.2} />}
                          {file.iconType === "file" && <File size={17} strokeWidth={2} />}
                        </div>

                        {/* Title, tags and path */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              onClick={() => openFile(`/api/files/box/${file.path}`, file.fileName)}
                              className="font-bold text-ink text-[13px] hover:text-brand-600 hover:underline text-left truncate max-w-full"
                              title={`Open ${file.fileName}`}
                            >
                              {file.fileName}
                            </button>

                            {/* Format Pill */}
                            <span className={`badge ${file.badgeColor} text-[10px] font-bold uppercase py-0 px-1.5`}>
                              {file.ext}
                            </span>

                            {/* Facility & Borrower */}
                            {file.borrower && (
                              <span className="badge badge-brand text-[10.5px] font-medium py-0 px-1.5">
                                {file.facilityId} · {file.borrower}
                              </span>
                            )}

                            {/* Flow direction badge */}
                            <span
                              className={`badge text-[10.5px] font-medium py-0 px-1.5 ${file.isInbound ? "badge-info" : "badge-gray"
                                }`}
                            >
                              {file.isInbound ? "Lincoln Inbound" : "Borrower Package"}
                            </span>
                          </div>

                          {/* Directory context breadcrumb */}
                          <div className="flex items-center gap-1 mt-1 text-[11px] font-mono text-muted truncate">
                            <Folder size={11} className="shrink-0 opacity-70 text-brand-600" />
                            <span className="truncate">{file.dirPath}/</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Action links */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {/* Copy Link Action */}
                        <button
                          onClick={(e) => handleCopy(file.path, e)}
                          className={`btn btn-secondary btn-sm !h-7 !px-2.5 gap-1.5 text-xs transition-all shadow-xs ${isCopied
                            ? "!border-success-500 !bg-success-50 !text-success-800 dark:!bg-success-950/40"
                            : "hover:border-brand-400"
                            }`}
                          title="Copy direct link to clipboard"
                        >
                          {isCopied ? (
                            <>
                              <Check size={12} className="text-success-600" strokeWidth={2.5} />
                              <span className="font-semibold text-success-700">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              <span>Copy Link</span>
                            </>
                          )}
                        </button>

                        {/* Open File Action */}
                        <button
                          onClick={() => openFile(`/api/files/box/${file.path}`, file.fileName)}
                          className="btn btn-primary btn-sm !h-7 !px-2.5 gap-1.5 text-xs font-semibold shadow-xs"
                          title="Open document in viewer"
                        >
                          <ExternalLink size={12} />
                          <span>Open</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer Summary Strip */}
            <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  <span>{pdfCount} PDF Reports</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>{xlsxCount} Excel Workbooks</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  <span>{parsedFiles.length} Total Synced</span>
                </span>
              </div>
              <div className="text-[11px] text-muted font-medium">
                Protected by ABIQ Bearer Authentication
              </div>
            </div>
          </Card>
        </div>

        {/* Right (1 col): Gateway Sync Overview & Extraction Exceptions */}
        <div className="space-y-6">
          {/* Gateway Status Card */}
          <Card
            title={
              <span className="flex items-center gap-2">
                <Folder size={16} className="text-brand-600" /> Box Gateway Status
              </span>
            }
            subtitle="Folder synchronization and storage protocol"
            className="shadow-sm"
          >
            <div className="space-y-3.5 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-control bg-surface-2/60 border border-line">
                <span className="text-muted font-medium">Remote Folder:</span>
                <span className="font-mono text-ink font-semibold">box://tiq-marks/{cycle.period}/</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-control bg-surface-2/60 border border-line">
                <span className="text-muted font-medium">Auto-Sync Protocol:</span>
                <span className="badge badge-green font-semibold">Polling Active (120s)</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-control bg-surface-2/60 border border-line">
                <span className="text-muted font-medium">Inbound Valuations:</span>
                <span className="num font-bold text-ink">{inboundCount} files received</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-control bg-surface-2/60 border border-line">
                <span className="text-muted font-medium">Outbound Packages:</span>
                <span className="num font-bold text-ink">{outboundCount} files shared</span>
              </div>
              <button
                className="btn btn-secondary btn-sm w-full justify-center gap-2 mt-2"
                onClick={() =>
                  act.run(async () => {
                    const r = await api(`/cycles/${cycle.id}/lincoln/ingest`, { body: {} });
                    setNote(
                      r.received
                        ? `Received ${r.received} valuation${r.received === 1 ? "" : "s"} from Lincoln.`
                        : "Box folder is up to date. Nothing new to ingest."
                    );
                    reload();
                  })
                }
              >
                <RefreshCw size={13} />
                <span>Check Box for New Files</span>
              </button>
            </div>
          </Card>

          {/* Extraction Exceptions Card */}
          <Card
            title="Extraction Exceptions (A4)"
            ai
            subtitle="Automated cross-validation between Lincoln reports and spreadsheet marks"
            className="shadow-sm"
          >
            {data.exceptions.length ? (
              <div className="space-y-2 text-xs">
                {data.exceptions.map((x: any) => (
                  <div key={x.id} className="p-2.5 rounded-control border border-danger-200 bg-danger-50 text-danger-800">
                    {JSON.stringify(x.payload)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[130px] flex-col items-center justify-center text-center p-3">
                <CheckCircle2 size={26} className="text-success-600 mb-2" />
                <div className="text-xs font-semibold text-ink">Zero Extraction Discrepancies</div>
                <div className="text-[11.5px] text-muted mt-1 leading-relaxed">
                  Every Lincoln PDF report matches its spreadsheet row values exactly.
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
