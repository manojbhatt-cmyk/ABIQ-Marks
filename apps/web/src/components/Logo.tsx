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
    <span className="inline-flex items-center gap-2.5" aria-label="ABIQ Marks">
      <Mark />
      <span className={`text-[17px] font-bold tracking-[-0.02em] ${dark ? "" : "text-ink"}`}>ABIQ Marks</span>
    </span>
  );
}
