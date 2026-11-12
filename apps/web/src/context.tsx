import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { api, token, User } from "./api";
import { setDay0 } from "./display";

type Cycle = { id: string; period: string; day: number; day0?: string; stage_step?: number; progress?: number; status: string; cycle_type: string; final_value: number | null };
type Ctx = { user: User | null; setUser: (u: User | null) => void; cycle: Cycle | null; cycles: Cycle[]; setCycleId: (id: string) => void; refreshCycles: () => Promise<void> };

const AppCtx = createContext<Ctx>({} as Ctx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleId, setCycleId] = useState<string | null>(localStorage.getItem("tiq_cycle"));
  const refreshCycles = async () => {
    if (!token()) return;
    try {
      setCycles(await api<Cycle[]>("/cycles"));
    } catch {}
  };
  useEffect(() => {
    if (token()) api<User>("/auth/me").then(setUser).catch(() => setUser(null));
    refreshCycles();
  }, []);
  useEffect(() => { if (user) refreshCycles(); }, [user]);
  // Keep the cycle list current (a reset or another user's action changes it): on focus and every 20 seconds.
  useEffect(() => {
    const onFocus = () => refreshCycles();
    window.addEventListener("focus", onFocus);
    const t = setInterval(refreshCycles, 20000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(t); };
  }, []);
  const quarterly = cycles.filter((c) => c.cycle_type === "quarterly");
  const cycle = quarterly.find((c) => c.id === cycleId) || quarterly[0] || null;
  useEffect(() => { setDay0(cycle?.day0); }, [cycle?.day0]);
  return (
    <AppCtx.Provider value={{ user, setUser, cycle, cycles, setCycleId: (id) => { localStorage.setItem("tiq_cycle", id); setCycleId(id); }, refreshCycles }}>
      {children}
    </AppCtx.Provider>
  );
}

export const useApp = () => useContext(AppCtx);
