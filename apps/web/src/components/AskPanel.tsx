import { Send, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context";

const SUGGESTED = ["What changed in Harbor's valuation and why?", "Why is Harbor on the agenda?", "Why is Sunrise at 88.5?", "Is Maple on the agenda?"];

export function AskBody({ initial }: { initial?: string }) {
  const { cycle } = useApp();
  const [q, setQ] = useState("");
  const [log, setLog] = useState<{ q: string; a: any }[]>([]);
  const [busy, setBusy] = useState(false);
  const ask = async (question: string) => {
    if (!question.trim()) return;
    setBusy(true);
    try {
      const a = await api("/ask", { body: { question, cycle_id: cycle?.id } });
      setLog((l) => [...l, { q: question, a }]);
    } catch (e: any) {
      setLog((l) => [...l, { q: question, a: { answer: e.message, citations: [] } }]);
    } finally {
      setBusy(false);
      setQ("");
    }
  };
  useEffect(() => { if (initial) ask(initial); }, [initial]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {!log.length && (
          <div className="space-y-2">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.03em] text-slate-500">Suggested questions</div>
            {SUGGESTED.map((s) => <button key={s} className="block w-full rounded-tile border border-line-200 bg-white px-3 py-2.5 text-left text-[13.5px] text-ink-700 transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50" onClick={() => ask(s)}>{s}</button>)}
          </div>
        )}
        {log.map((x, i) => (
          <div key={i} className="space-y-2">
            <div className="ml-10 rounded-[10px_10px_2px_10px] bg-navy-900 px-3 py-2 text-[13.5px] text-white">{x.q}</div>
            <div className="ai-strip">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink-900"><Sparkles size={14} className="text-brand-600" aria-hidden="true" /> TIQ</div>
              <div className="text-[13.5px] leading-relaxed text-ink-700">{x.a.answer}</div>
              {x.a.citations?.length > 0 && (
                <div className="mt-2 border-t border-brand-100 pt-2 text-xs">
                  <div className="font-semibold text-slate-500">Sources</div>
                  {x.a.citations.map((c: any, j: number) => <div key={j} className="text-brand-700">[{j + 1}] {c.label}</div>)}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-[13px] text-slate-500"><span className="spinner !h-4 !w-4 !border-2" aria-hidden="true" /> Thinking</div>}
      </div>
      <div className="border-t border-line-200 px-5 py-4">
        <div className="flex gap-2">
          <input className="input" aria-label="Ask about this cycle" placeholder="Ask about this cycle" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(q)} />
          <button className="btn-primary" aria-label="Ask" disabled={busy} onClick={() => ask(q)}><Send size={16} /></button>
        </div>
        <div className="mt-2 text-xs text-slate-500">TIQ cannot take actions. Answers cite the records they use.</div>
      </div>
    </div>
  );
}

export default function AskPanel({ onClose, initial }: { onClose: () => void; initial?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
      <div className="anim-scrim fixed inset-0 z-[45]" style={{ background: "rgba(11,20,55,.25)" }} onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label="Ask TIQ" className="anim-panel fixed inset-y-0 right-0 z-[46] flex w-[min(420px,100vw)] flex-col bg-white shadow-raised">
        <div className="flex h-[60px] items-center justify-between border-b border-line-200 px-5">
          <h2 className="flex items-center gap-2 text-base font-bold"><Sparkles size={18} className="text-brand-600" aria-hidden="true" /> Ask TIQ</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <AskBody initial={initial} />
      </aside>
    </>
  );
}
