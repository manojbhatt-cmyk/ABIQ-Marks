/** Logo: the AB square mark (left square of /ab-logo.jpg), then the ABIQ Marks wordmark. */
function Mark({ size = 32 }: { size?: number }) {
  return (
    <span className="shrink-0 overflow-hidden rounded-[3px]" style={{ width: size, height: size }} aria-hidden="true">
      <img src="/ab-logo.jpg" alt="" height={size} style={{ height: size, width: "auto", maxWidth: "none" }}
        className="select-none" draggable={false} />
    </span>
  );
}

export default function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5" aria-label="ABIQ Marks by TransOrg Analytics">
      <Mark size={28} />
      <div className="flex flex-col">
        <span className={`text-[15px] font-bold leading-none tracking-[-0.02em] ${dark ? "text-white" : "text-ink"}`}>
          ABIQ Marks
        </span>
        <span className="mt-1 text-[9.5px] font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
          TransOrg Analytics
        </span>
      </div>
    </div>
  );
}
