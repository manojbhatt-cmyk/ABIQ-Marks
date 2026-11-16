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
  const [resetting, setResetting] = useState(false);
  // Load the demo people; while the demo data is being reset (503), say so and try again every few seconds.
  useEffect(() => {
    let stop = false, timer: any;
    const load = () => api<User[]>("/auth/demo-users").then((u) => { if (stop) return; setResetting(false); setUsers(u); if (!u.length) timer = setTimeout(load, 4000); })
      .catch((e: any) => {
        if (stop) return;
        if (e.status === 503) { setResetting(true); timer = setTimeout(load, 4000); }
        else setErr("TIQ cannot reach its server. Start the API, then reload this page.");
      });
    load();
    return () => { stop = true; clearTimeout(timer); };
  }, []);
  const login = async (e?: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ token: string; user: User }>("/auth/login", { body: { email: e || email, password } });
      localStorage.setItem("tiq_token", r.token);
      setUser(r.user);
      await refreshCycles();
      nav(homeFor(r.user.role));
    } catch (x: any) { if (x.status === 503) setResetting(true); else setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-full grid-cols-1 min-[960px]:grid-cols-[1.1fr_1fr]">
      <div className="login-panel relative hidden flex-col justify-between gap-6 overflow-hidden px-12 py-8 min-[960px]:flex">
        <div className="relative"><Logo dark /></div>
        <div className="anim-modal relative">
          <h1 className="max-w-[520px] text-[clamp(28px,2.8vw,36px)] font-semibold leading-[1.15] tracking-[-0.02em]" style={{ color: "inherit" }}>One governed workflow for every quarterly mark.</h1>
          <p className="mt-4 max-w-[460px] text-[15px] leading-relaxed login-muted">AllianceBernstein Private Credit: 22 quarterly steps, 6 monthly steps and three approval gates, from borrower packages to distributed marks.</p>
          <ul className="mt-6 space-y-2.5">
            {POINTS.map((p) => <li key={p} className="flex items-center gap-2.5 text-[13.5px]"><CheckCircle2 size={16} className="login-check shrink-0" aria-hidden="true" />{p}</li>)}
          </ul>
        </div>
        <div className="login-muted relative flex items-center gap-2 text-[13px]"><ShieldCheck size={16} aria-hidden="true" /> Demo environment. All loan and borrower data is synthetic.</div>
      </div>

      <div className="flex items-center justify-center bg-page px-4 py-6">
        <div className="anim-modal card w-full max-w-[440px] px-7 py-6">
          <h2 className="text-[20px] font-semibold">Sign in</h2>
          <p className="mt-1 text-[13.5px] text-slate-500">Use your work account or pick a demo person below.</p>
          <form className="mt-5 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); login(); }}>
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-medium text-slate-500">Email</span>
              <input className="input" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-medium text-slate-500">Password</span>
              <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <span className="text-xs text-muted">Every demo person's password is <span className="mono">demo</span>.</span></label>
            {resetting && <div role="status" className="flex items-center gap-2 rounded-control border border-line bg-raised px-3 py-2 text-[13.5px] text-ink"><span className="spinner !h-4 !w-4 !border-2" aria-hidden="true" />TIQ is resetting the demo data. Sign-in opens again in about a minute.</div>}
            {err && <div role="alert" className="rounded-control border border-danger-100 bg-danger-50 px-3 py-2 text-[13.5px] text-danger-700">{err}</div>}
            <button className="btn-primary btn-lg w-full" disabled={busy || resetting}>{busy ? "Signing in" : "Sign in"}</button>
          </form>
          <div className="my-4 h-px bg-line" />
          <p className="text-[13px] text-slate-500">Demo people. Click one to sign in as them.</p>
          <div className="mt-3 grid max-h-[268px] grid-cols-2 gap-2 overflow-y-auto pr-1">
            {users.map((u) => (
              <button key={u.email} disabled={busy} className="flex h-[54px] min-w-0 flex-col justify-center rounded-control border border-line bg-surface px-[11px] py-2 text-left transition-colors duration-150 hover:border-strong hover:bg-raised disabled:cursor-wait"
                onClick={() => { setEmail(u.email); login(u.email); }}>
                <span className="truncate text-[13px] font-semibold text-ink">{u.name}</span>
                <span className="truncate text-xs text-slate-500">{ROLE_LABEL[u.role]}{u.deal_team_id ? `, ${u.deal_team_id.replace("DT-", "").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}` : ""}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
