import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ROLE_LABEL, User } from "../api";
import Logo from "../components/Logo";
import { homeFor } from "../components/Shell";
import { useApp } from "../context";

const POINTS = [
  "Borrower packages read and classified as they arrive",
  "Spreads, CMRs and challenges drafted by agents, decided by people",
  "Three gates, every decision recorded with who and why",
];

export default function Login() {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("pm.analyst@ab-poc.local");
  const [password, setPassword] = useState("demo");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { setUser, refreshCycles } = useApp();
  const nav = useNavigate();
  useEffect(() => { api<User[]>("/auth/demo-users").then(setUsers).catch(() => setErr("TIQ cannot reach its server. Start the API, then reload this page.")); }, []);
  const login = async (e?: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ token: string; user: User }>("/auth/login", { body: { email: e || email, password } });
      localStorage.setItem("tiq_token", r.token);
      setUser(r.user);
      await refreshCycles();
      nav(homeFor(r.user.role));
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-full grid-cols-1 min-[960px]:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between gap-6 overflow-hidden bg-navy-depth px-12 py-8 text-white min-[960px]:flex">
        <div className="pointer-events-none absolute -right-[30%] -top-[35%] h-[520px] w-[520px] rounded-full bg-brand-500 opacity-35 blur-[90px]" aria-hidden="true" />
        <div className="relative"><Logo dark /></div>
        <div className="anim-modal relative">
          <h1 className="max-w-[520px] text-[clamp(28px,2.8vw,38px)] font-bold leading-[1.12] tracking-[-0.02em] text-white">One governed workflow for every quarterly mark.</h1>
          <p className="mt-4 max-w-[460px] text-[15px] leading-relaxed text-white/[.72]">AllianceBernstein Private Credit: 22 quarterly steps, 6 monthly steps and three approval gates, from borrower packages to distributed marks.</p>
          <ul className="mt-6 space-y-2.5">
            {POINTS.map((p) => <li key={p} className="flex items-center gap-2.5 text-[13.5px] text-white/[.85]"><CheckCircle2 size={16} className="shrink-0 text-cyan-500" aria-hidden="true" />{p}</li>)}
          </ul>
        </div>
        <div className="relative flex items-center gap-2 text-[13px] text-white/60"><ShieldCheck size={16} aria-hidden="true" /> Demo environment. All loan and borrower data is synthetic.</div>
      </div>

      <div className="flex items-center justify-center bg-canvas-100 px-4 py-6">
        <div className="anim-modal card w-full max-w-[440px] px-7 py-6">
          <h2 className="text-[22px] font-bold">Sign in</h2>
          <p className="mt-1 text-[13.5px] text-slate-500">Use your work account or pick a demo person below.</p>
          <form className="mt-5 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); login(); }}>
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-medium text-slate-500">Email</span>
              <input className="input" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-medium text-slate-500">Password</span>
              <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            {err && <div role="alert" className="rounded-tile bg-danger-100 px-3 py-2 text-[13.5px] text-danger-700">{err}</div>}
            <button className="btn-primary btn-lg w-full" disabled={busy}>{busy ? "Signing in" : "Sign in"}</button>
          </form>
          <div className="my-4 h-px bg-line-200" />
          <p className="text-[13px] text-slate-500">Demo people. Click one to sign in as them.</p>
          <div className="mt-3 grid max-h-[268px] grid-cols-2 gap-2 overflow-y-auto pr-1">
            {users.map((u) => (
              <button key={u.email} disabled={busy} className="flex h-[54px] min-w-0 flex-col justify-center rounded-tile border border-line-200 bg-white px-[11px] py-2 text-left transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50 disabled:cursor-wait"
                onClick={() => { setEmail(u.email); login(u.email); }}>
                <span className="truncate text-[13px] font-bold text-ink-900">{u.name}</span>
                <span className="truncate text-xs text-slate-500">{ROLE_LABEL[u.role]}{u.deal_team_id ? `, ${u.deal_team_id.replace("DT-", "").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}` : ""}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
