import { Check, Copy, FileText, Lightbulb, RefreshCw, Send } from "lucide-react";
import { useState } from "react";
import { api, openFile } from "../api";
import { AiChip, Chip } from "./ui";

type Diff = { assumption_quote?: string; finding: string; math?: string; evidence: any[]; materiality: string; kind?: string };

const MAT: Record<string, { tone: "red" | "amber" | "neutral"; label: string }> = {
  high: { tone: "red", label: "High materiality" }, medium: { tone: "amber", label: "Medium materiality" }, low: { tone: "neutral", label: "Low materiality" },
};

/** One finding: Lincoln's assumption, what ABIQ found, the math, the evidence and how much it matters. */
function Finding({ d, n }: { d: Diff; n: number }) {
  const m = MAT[d.materiality] || MAT.low;
  const math = (d.math || "").split(/;\s+/).filter(Boolean);
  return (
    <article className="rounded-panel border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="num text-[12px] font-medium text-faint">{String(n).padStart(2, "0")}</span>
        <span className="text-[13px] font-semibold text-ink">{d.kind === "market_context" ? "Market context" : "Difference with Lincoln"}</span>
        <span className="ml-auto"><Chip tone={m.tone} dot>{m.label}</Chip></span>
      </header>
      <div className="space-y-3 px-4 py-3.5">
        {d.assumption_quote && (
          <div>
            <div className="text-xs font-medium text-muted">{d.kind === "market_context" ? "Source" : "Lincoln assumes"}</div>
            <blockquote className="mt-1 border-l-2 border-strong pl-3 text-[13.5px] italic text-muted">“{d.assumption_quote}”</blockquote>
          </div>)}
        <div>
          <div className="text-xs font-medium text-muted">What ABIQ found</div>
          <p className="mt-1 text-[14px] leading-relaxed text-ink">{d.finding}</p>
        </div>
        {math.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted">The math</div>
            <pre className="mt-1 whitespace-pre-wrap rounded-control bg-sunken px-3 py-2 font-mono text-[12.5px] leading-relaxed text-ink">{math.join("\n")}</pre>
          </div>)}
        {d.evidence?.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">Evidence</span>
            {d.evidence.map((e: any, j: number) => (
              <button key={j} className="badge badge-gray hover:border-strong" disabled={!e.doc_id} title={e.doc_id ? `Open ${e.file} at page ${e.page}` : e.file}
                onClick={() => e.doc_id && api(`/documents/${e.doc_id}`).then((dd) => openFile(dd.url))}>
                <FileText size={12} aria-hidden="true" />{e.file}{e.page ? ` p.${e.page}` : ""}
              </button>))}
          </div>)}
      </div>
    </article>
  );
}

/** Challenge Assistant (A5) output on the Pricing (G1) tab. A send-back stays a hint: nothing is pre-selected. */
export default function Challenge({ challenge, canRun, onRun, onUseNote, running }: {
  challenge: any; canRun: boolean; onRun: () => void; onUseNote: (note: string) => void; running?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const ch = challenge?.payload;
  if (!ch) {
    return (
      <section className="card p-5">
        <div className="flex items-center gap-2"><span className="text-[14px] font-semibold">Challenge Assistant</span><AiChip>A5</AiChip></div>
        <p className="mt-1 text-[13px] text-muted">Compares Lincoln's key assumptions with what the Deal Team knows (package, spread, sponsor letters, market guidance) and shows the math.</p>
        <button className="btn-secondary mt-3" disabled={!canRun || running} onClick={onRun}>{running ? "Running" : "Run the Challenge Assistant"}</button>
      </section>);
  }
  const diffs: Diff[] = ch.differences || [];
  const high = diffs.filter((d) => d.materiality === "high").length;
  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div>
          <div className="flex items-center gap-2"><span className="text-[14px] font-semibold">Challenge Assistant</span><AiChip>A5 · Lincoln v{ch.lincoln_version}</AiChip></div>
          <p className="mt-0.5 text-[13px] text-muted">{ch.summary}</p>
        </div>
        {canRun && <button className="btn-ghost btn-sm" disabled={running} onClick={onRun}><RefreshCw size={14} aria-hidden="true" /> {running ? "Running" : "Run again"}</button>}
      </div>
      <div className="space-y-3 p-5 pt-4">
        {high > 0 && (
          <div className="flex items-start gap-2 rounded-control border border-line bg-raised px-3 py-2 text-[13px] text-ink">
            <Lightbulb size={16} className="mt-0.5 shrink-0 text-accent-600" aria-hidden="true" />
            <span>ABIQ suggests considering a send-back: {high} high-materiality difference{high > 1 ? "s" : ""}. The decision is yours; nothing is selected for you.</span>
          </div>)}
        {diffs.length ? diffs.map((d, i) => <Finding key={i} d={d} n={i + 1} />)
          : <div className="rounded-panel border border-line px-4 py-6 text-center text-[13px] text-muted">No differences found between Lincoln's assumptions and the Deal Team's evidence.</div>}
        {ch.draft_note && (
          <div className="ai-note">
            <div className="mb-1.5 flex items-center gap-2"><AiChip>Draft</AiChip><span className="text-[13px] font-medium">Send-back note to Lincoln</span></div>
            <p className="text-[13.5px] leading-relaxed">{ch.draft_note}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-secondary btn-sm" onClick={() => { navigator.clipboard?.writeText(ch.draft_note); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>
                {copied ? <><Check size={14} aria-hidden="true" /> Copied</> : <><Copy size={14} aria-hidden="true" /> Copy</>}</button>
              <button className="btn-secondary btn-sm" onClick={() => onUseNote(ch.draft_note)}><Send size={14} aria-hidden="true" /> Use in a send-back</button>
            </div>
          </div>)}
      </div>
    </section>
  );
}
