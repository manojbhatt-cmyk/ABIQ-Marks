/** Logo (Design.md 2.2): the TransOrg round mark, then a two-line wordmark. Never recolour or stretch the mark. */
function Mark({ size = 32 }: { size?: number }) {
  return <img src="/transorg-mark.png" alt="" aria-hidden="true" width={size} height={size} className="shrink-0 select-none" draggable={false} />;
}

export default function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="TransOrg TIQ Marks">
      {dark ? <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white"><Mark size={30} /></span> : <Mark />}
      <span className="flex flex-col leading-tight">
        <span className={`text-base font-extrabold tracking-[-0.02em] ${dark ? "text-white" : "text-ink-900"}`}>TransOrg</span>
        <span className={`text-[11px] font-medium ${dark ? "text-cyan-500" : "text-slate-500"}`}>TIQ Marks</span>
      </span>
    </span>
  );
}
