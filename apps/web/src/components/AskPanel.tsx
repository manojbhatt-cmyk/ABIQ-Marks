import { FileText, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../context";
import { AiChip } from "./ui";

type Turn = { q: string; a: { answer: string; citations?: { label: string }[]; kind?: string } };

/** Open the chat from anywhere, optionally with a question: window.dispatchEvent(new CustomEvent("tiq:ask", { detail })) */
export const openAsk = (question?: string) => window.dispatchEvent(new CustomEvent("tiq:ask", { detail: question || "" }));

function useLoanContext() {
  const loc = useLocation();
  const id = loc.pathname.match(/^\/loans\/([^/]+)/)?.[1] || null;
  const [borrower, setBorrower] = useState<string | null>(null);
  useEffect(() => {
    setBorrower(null);
    if (id) api(`/loans/${id}`).then((d) => setBorrower(d?.loan?.borrower || null)).catch(() => {});
  }, [id]);
  return { id, borrower };
}

/** Ask TIQ: a round launcher at the bottom right of every page and a docked chat (full screen on phones).
 * It stays mounted in the shell, so the conversation survives moving between pages. TIQ cannot take actions. */
export default function AskLauncher() {
  const { cycle } = useApp();
  const ctx = useLoanContext();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [log, setLog] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setBusy(true); setQ("");
    try {
      const history = log.slice(-3).flatMap((t) => [{ role: "user", content: t.q }, { role: "assistant", content: t.a.answer }]);
      const a = await api("/ask", { body: { question, cycle_id: cycle?.id, cycle_loan_id: ctx.id, history } });
      setLog((l) => [...l, { q: question, a }]);
    } catch (e: any) {
      setLog((l) => [...l, { q: question, a: { answer: e.message, citations: [] } }]);
    } finally { setBusy(false); }
  };
  useEffect(() => {
    const onAsk = (e: Event) => { setOpen(true); const d = (e as CustomEvent).detail; if (d) ask(d); };
    window.addEventListener("tiq:ask", onAsk);
    return () => window.removeEventListener("tiq:ask", onAsk);
  });
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    setTimeout(() => input.current?.focus(), 50);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [log.length, busy]);
  const b = ctx.borrower;
  const suggested = b
    ? [`What changed in ${b}'s valuation and why?`, `Why is ${b} on the agenda?`, `Where is ${b} in the process?`]
    : ["What changed in Harbor's valuation and why?", "Why is Harbor on the agenda?", "Why is Sunrise at 88.5?", "Is Maple on the agenda?"];
  return (
    <>
      {open && (
        <section role="dialog" aria-label="Ask TIQ"
          className="anim-modal fixed inset-0 z-[46] flex flex-col bg-surface sm:inset-auto sm:bottom-[88px] sm:right-6 sm:h-[min(600px,calc(100vh-120px))] sm:w-[400px] sm:rounded-card sm:border sm:border-line sm:shadow-float">
          <header className="flex items-center gap-2 border-b border-line px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-50 text-accent-600"><Sparkles size={16} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-ink">Ask TIQ</div>
              <div className="truncate text-xs text-muted">{b ? `About ${b}` : cycle ? `About the ${cycle.period} cycle` : "About this cycle"}</div>
            </div>
            {log.length > 0 && <button className="icon-btn" title="New conversation" aria-label="New conversation" onClick={() => setLog([])}><RotateCcw size={16} /></button>}
            <button className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button>
          </header>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {!log.length && (
              <div className="space-y-2">
                <p className="text-[13px] text-muted">Questions about loans, marks and decisions in this cycle. Every answer cites the records it used.</p>
                {suggested.map((s) => <button key={s} className="block w-full rounded-control border border-line bg-surface px-3 py-2.5 text-left text-[13px] text-ink transition-colors duration-150 hover:border-strong hover:bg-raised" onClick={() => ask(s)}>{s}</button>)}
              </div>)}
            {log.map((x, i) => (
              <div key={i} className="space-y-2">
                <div className="ml-10 rounded-[12px_12px_4px_12px] bg-brand-600 px-3 py-2 text-[13.5px] text-on-brand">{x.q}</div>
                <div className="ai-note">
                  <div className="mb-1 flex flex-wrap items-center gap-2"><AiChip>TIQ</AiChip>{x.a.kind === "general" && <span className="text-[11px] text-muted">General answer, not from a loan's records</span>}</div>
                  <div className="text-[13.5px] leading-relaxed">{x.a.answer}</div>
                  {!!x.a.citations?.length && (
                    <div className="mt-2 flex flex-wrap gap-1.5">{x.a.citations.map((c, j) => <span key={j} className="badge badge-gray"><FileText size={12} aria-hidden="true" />{c.label}</span>)}</div>)}
                </div>
              </div>))}
            {busy && <div role="status" className="flex items-center gap-2 text-[13px] text-muted"><span className="spinner !h-4 !w-4 !border-2" aria-hidden="true" /> Looking through the records</div>}
            <div ref={end} />
          </div>
          <footer className="border-t border-line px-4 py-3">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
              <input ref={input} className="input" aria-label="Your question" placeholder={b ? `Ask about ${b}` : "Ask about this cycle"} value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn-primary" aria-label="Send" disabled={busy || !q.trim()}><Send size={16} aria-hidden="true" /></button>
            </form>
            <div className="mt-1.5 text-[11.5px] text-faint">TIQ cannot take actions.</div>
          </footer>
        </section>)}
      <button onClick={() => setOpen(!open)} aria-label={open ? "Close Ask TIQ" : "Ask TIQ"} aria-expanded={open} title="Ask TIQ"
        className={`fixed bottom-6 right-6 z-[47] flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-on-brand shadow-float transition-transform duration-150 hover:scale-105 active:scale-95 ${open ? "max-sm:hidden" : ""}`}>
        {open ? <X size={22} aria-hidden="true" /> : <Sparkles size={22} aria-hidden="true" />}
      </button>
    </>
  );
}
