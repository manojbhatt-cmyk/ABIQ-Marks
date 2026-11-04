import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ROLE_LABEL, User } from "../api";
import { homeFor } from "../components/Shell";
import { useApp } from "../context";

export default function Login() {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("pm.analyst@ab-poc.local");
  const [password, setPassword] = useState("demo");
  const [err, setErr] = useState<string | null>(null);
  const { setUser, refreshCycles } = useApp();
  const nav = useNavigate();
  useEffect(() => { api<User[]>("/auth/demo-users").then(setUsers).catch(() => setErr("The API is not reachable. Start it with: uvicorn api.main:app --port 8000")); }, []);
  const login = async (e?: string) => {
    try {
      const r = await api<{ token: string; user: User }>("/auth/login", { body: { email: e || email, password } });
      localStorage.setItem("tiq_token", r.token);
      setUser(r.user);
      await refreshCycles();
      nav(homeFor(r.user.role));
    } catch (x: any) { setErr(x.message); }
  };
  return (
    <div className="flex min-h-full">
      <div className="hidden w-[42%] flex-col justify-between bg-navy-900 p-12 text-white lg:flex">
        <div>
          <div className="text-3xl font-bold">TIQ Marks</div>
          <div className="mt-1 text-slate-400">AllianceBernstein Private Credit</div>
        </div>
        <div>
          <div className="text-2xl font-semibold leading-snug">One governed workflow for monthly and quarterly marks.</div>
          <div className="mt-3 text-slate-300">22 quarterly steps, 6 monthly steps, three approval gates. Agents prepare, people decide.</div>
        </div>
        <div className="text-xs text-slate-500">TransOrg Analytics. Synthetic data only.</div>
      </div>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="mt-1 text-sm text-slate-400">Demo users share the password "demo".</p>
          {err && <div className="mt-4 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700">{err}</div>}
          <div className="mt-6 space-y-3">
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" onKeyDown={(e) => e.key === "Enter" && login()} />
            <button className="btn-primary w-full justify-center py-2" onClick={() => login()}>Sign in</button>
          </div>
          <div className="mt-8">
            <div className="label">Or pick a demo user</div>
            <div className="grid max-h-80 grid-cols-1 gap-1 overflow-y-auto">
              {users.map((u) => (
                <button key={u.email} className="flex items-center justify-between rounded-lg border border-canvas-200 bg-white px-3 py-2 text-left text-sm hover:border-brand-500" onClick={() => { setEmail(u.email); login(u.email); }}>
                  <span>{u.name}</span><span className="text-xs text-slate-400">{ROLE_LABEL[u.role]}{u.deal_team_id ? ` ${u.deal_team_id.replace("DT-", "")}` : ""}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
