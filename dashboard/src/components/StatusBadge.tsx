import type { RunStatus, StageStatus } from "../lib/types";

type Status = RunStatus | StageStatus;

const styles: Record<string, string> = {
  passed:    "bg-success/20 text-success border border-success/30",
  failed:    "bg-danger/20 text-danger border border-danger/30",
  running:   "bg-accent/20 text-accent border border-accent/30 animate-pulse",
  pending:   "bg-warning/20 text-warning border border-warning/30",
  cancelled: "bg-slate-100 text-muted border border-slate-300",
  skipped:   "bg-slate-100 text-muted border border-slate-300",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-mono transition-all duration-200 shadow-sm ${styles[status] ?? styles.skipped}`}
    >
      {status}
    </span>
  );
}
