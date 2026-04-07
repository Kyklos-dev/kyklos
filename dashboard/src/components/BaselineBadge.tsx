/** Small label for runs marked as the pipeline compare baseline. */
export function BaselineBadge({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border border-amber-600/35 bg-amber-50 text-amber-900 ${className ?? ""}`}
    >
      Baseline
    </span>
  );
}
