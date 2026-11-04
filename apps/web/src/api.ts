import { useCallback, useEffect, useState } from "react";

export type User = { email: string; name: string; role: string; deal_team_id: string | null };

export function token(): string | null {
  return localStorage.getItem("tiq_token");
}

export class ApiError extends Error {
  status: number;
  kind?: string;
  constructor(status: number, message: string, kind?: string) {
    super(message);
    this.status = status;
    this.kind = kind;
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: any; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`/api${path}`, { method: opts.method || (body ? "POST" : "GET"), headers, body });
  if (res.status === 401 && !path.startsWith("/auth/login")) {
    localStorage.removeItem("tiq_token");
    window.location.href = "/login";
  }
  if (!res.ok) {
    let msg = res.statusText;
    let kind;
    try {
      const j = await res.json();
      msg = j.detail || msg;
      kind = j.kind;
    } catch {}
    throw new ApiError(res.status, typeof msg === "string" ? msg : JSON.stringify(msg), kind);
  }
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? res.json() : (res.blob() as any)) as T;
}

export function useApi<T = any>(path: string | null, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e: any) {
      setError(e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, loading, reload: load, setData };
}

export async function openFile(url: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
  const blob = await res.blob();
  window.open(URL.createObjectURL(blob), "_blank");
}

export const fmt = {
  mark: (v: number | null | undefined) => (v === null || v === undefined ? "-" : v.toFixed(2)),
  m: (v: number | null | undefined, d = 3) => (v === null || v === undefined ? "-" : `$${v.toFixed(d)}M`),
  num: (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "-" : v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })),
  x: (v: number | null | undefined) => (v === null || v === undefined ? "-" : `${v.toFixed(2)}x`),
  pct: (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "-" : `${(v * 100).toFixed(d)}%`),
  delta: (v: number | null | undefined, d = 3) => (v === null || v === undefined ? "-" : `${v >= 0 ? "+" : "-"}$${Math.abs(v).toFixed(d)}M`),
  date: (s: string | null | undefined) => (s ? new Date(s).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"),
  label: (s: string | null | undefined) => (s ? s.replace(/_/g, " ") : "-"),
};

export const ROLE_LABEL: Record<string, string> = {
  pm_team: "PM Team", deal_analyst: "Deal Team Analyst", deal_lead: "Deal Team Lead", ac_manager: "A/C Manager",
  sct: "SCT Reviewer", lincoln: "Lincoln", committee_member: "Committee Member", committee_chair: "Committee Chair",
  governance: "Governance Panel", finance_ir: "Finance / IR", admin: "Admin",
};
