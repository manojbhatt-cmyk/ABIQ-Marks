import { Send, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { useApp } from "../context";

const SUGGESTED = ["What changed in Harbor's valuation and why?", "Why is Harbor on the agenda?", "Why is Sunrise at 88.5?", "Is Maple on the agenda?"];

export function AskBody() {
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
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {!log.length && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase text-slate-500">Suggested questions</div>
            {SUGGESTED.map((s) => <button key={s} className="block w-full rounded-lg border border-canvas-200 bg-white px-3 py-2 text-left text-sm hover:border-brand-500" onClick={() => ask(s)}>{s}</button>)}
          </div>
        )}
        {log.map((x, i) => (
          <div key={i} className="space-y-2">
            <div className="ml-8 rounded-lg bg-navy-900 px-3 py-2 text-sm text-white">{x.q}</div>
            <div className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-slate-700">
              <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-brand-700"><Sparkles size={12} /> TIQ</div>
              {x.a.answer}
              {x.a.citations?.length > 0 && (
                <div className="mt-2 border-t border-brand-100 pt-2 text-xs">
                  <div className="font-semibold text-slate-500">Citations</div>
                  {x.a.citations.map((c: any, j: number) => <div key={j} className="text-info-600">[{j + 1}] {c.label}</div>)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-canvas-200 p-3">
        <div className="flex gap-2">
          <input className="input" placeholder="Ask about this cycle" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(q)} />
          <button className="btn-primary" disabled={busy} onClick={() => ask(q)}><Send size={14} /></button>
        </div>
        <div className="mt-1 text-[10px] text-slate-400">TIQ cannot take actions. Answers cite the records they use.</div>
      </div>
    </div>
  );
}

export default function AskPanel({ onClose }: { onClose: () => void }) {
  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-[400px] flex-col border-l border-canvas-200 bg-canvas-50 shadow-xl">
      <div className="flex items-center justify-between border-b border-canvas-200 px-4 py-3">
        <div className="flex items-center gap-2 font-semibold"><Sparkles size={16} className="text-brand-600" /> Ask TIQ</div>
        <button onClick={onClose}><X size={16} /></button>
      </div>
      <AskBody />
    </aside>
  );
}
