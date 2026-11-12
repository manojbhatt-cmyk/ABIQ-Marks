import { useState } from "react";

/** Logo (Design.md 2.2). Uses the official file at /transorg-logo.svg when it is present (inline variant crops the
 * round mark); until then it draws a neutral round mark in the brand colours. Never recolour the official logo. */
function Mark({ size = 30 }: { size?: number }) {
  const [missing, setMissing] = useState(false);
  if (!missing) {
    return (
      <span className="inline-block shrink-0 overflow-hidden" style={{ width: size + 1, height: size }}>
        <img src="/transorg-logo.svg" alt="" aria-hidden="true" style={{ height: size, maxWidth: "none" }} onError={() => setMissing(true)} />
      </span>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true" className="shrink-0">
      <circle cx="15" cy="15" r="14" fill="#0F3A58" />
      <path d="M15 4a11 11 0 0 1 11 11h-5a6 6 0 0 0-6-6z" fill="#4FC6DF" />
      <path d="M26 15a11 11 0 0 1-11 11v-5a6 6 0 0 0 6-6z" fill="#93CA5B" />
      <path d="M15 26A11 11 0 0 1 4 15h5a6 6 0 0 0 6 6z" fill="#2568B2" />
      <circle cx="15" cy="15" r="3" fill="#E2E439" />
    </svg>
  );
}

export default function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="TransOrg TIQ Marks">
      <Mark />
      <span className="flex flex-col leading-tight">
        <span className={`text-base font-extrabold tracking-[-0.02em] ${dark ? "text-white" : "text-ink-900"}`}>TransOrg</span>
        <span className={`text-[11px] font-medium ${dark ? "text-cyan-500" : "text-slate-500"}`}>TIQ Marks</span>
      </span>
    </span>
  );
}
