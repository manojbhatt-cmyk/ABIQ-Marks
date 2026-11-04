import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { api, token, User } from "./api";

type Cycle = { id: string; period: string; day: number; status: string; cycle_type: string; final_value: number | null };
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
  const quarterly = cycles.filter((c) => c.cycle_type === "quarterly");
  const cycle = quarterly.find((c) => c.id === cycleId) || quarterly[0] || null;
  return (
    <AppCtx.Provider value={{ user, setUser, cycle, cycles, setCycleId: (id) => { localStorage.setItem("tiq_cycle", id); setCycleId(id); }, refreshCycles }}>
      {children}
    </AppCtx.Provider>
  );
}

export const useApp = () => useContext(AppCtx);
