import { useState } from "react";
import type { GateResult, StageResult, StageStatus, StepResult } from "../lib/types";
import { Spinner } from "./Spinner";

/**
 * GitHub Actions–style job list: vertical stages, nested steps, green ✓ / red ✗.
 */
export function RunWorkflowChecklist({ stages }: { stages: StageResult[] }) {
  if (stages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-3 bg-surface-1/40 px-4 py-8 text-center text-muted text-xs">
        No stage results yet — the run may still be initializing.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-surface-3 bg-surface-1 overflow-hidden shadow-ky">
      <div className="px-4 py-2.5 border-b border-surface-3 bg-surface-0/50">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted">Workflow</h2>
      </div>
      <div className="divide-y divide-surface-3/80">
        {stages.map((stage) => (
          <StageJobBlock key={stage.id} stage={stage} />
        ))}
      </div>
    </div>
  );
}

function StageJobBlock({ stage }: { stage: StageResult }) {
  const duration = formatInterval(stage.started_at, stage.finished_at);
  const label =
    stage.iteration > 1 ? `${stage.stage_name} (iteration ${stage.iteration})` : stage.stage_name;

  return (
    <div className="bg-surface-1">
      {/* Job header — like a GH Actions job name row */}
      <div className="flex items-start gap-3 px-4 py-3 bg-surface-0/35">
        <div className="shrink-0 pt-0.5">
          <OutcomeIcon kind="stage" status={stage.status} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-gray-900 tracking-tight">{label}</span>
            {stage.retry_count > 0 && (
              <span className="text-[10px] uppercase tracking-wide text-warning">
                retried {stage.retry_count}×
              </span>
            )}
          </div>
        </div>
        {duration && (
          <span className="shrink-0 text-[11px] text-muted tabular-nums">{duration}</span>
        )}
      </div>

      {/* Steps — nested with left rail */}
      {(stage.steps?.length ?? 0) > 0 && (
        <div className="px-4 pb-3 pl-[2.75rem]">
          <div className="border-l-2 border-surface-3/90 pl-4 space-y-0">
            {(stage.steps ?? []).map((step, idx) => (
              <WorkflowStepRow
                key={`${stage.id}-${idx}-${step.uses}-${step.name}`}
                step={step}
                isLast={idx === (stage.steps?.length ?? 0) - 1}
              />
            ))}
          </div>
        </div>
      )}

      {/* Gates — same visual language as steps */}
      {(stage.gate_results?.length ?? 0) > 0 && (
        <div className="px-4 pb-3 pl-[2.75rem]">
          <p className="text-[10px] uppercase tracking-wider text-muted mb-2 pl-4">pass_if gates</p>
          <div className="border-l-2 border-surface-3/90 pl-4 space-y-0">
            {(stage.gate_results ?? []).map((g, idx) => (
              <GateCheckRow
                key={g.key + g.expr}
                gate={g}
                isLast={idx === (stage.gate_results?.length ?? 0) - 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkflowStepRow({
  step,
  isLast: _isLast,
}: {
  step: StepResult;
  isLast: boolean;
}) {
  const [open, setOpen] = useState(false);
  const scores = step.scores ?? {};
  const artifacts = step.artifacts ?? [];
  const logs = step.logs ?? [];
  const hasDetail = Object.keys(scores).length > 0 || logs.length > 0 || artifacts.length > 0;
  const title = step.name?.trim() ? step.name : step.uses;
  const subtitle = step.name?.trim() && step.name !== step.uses ? step.uses : null;

  return (
    <div className="border-b border-surface-3/40 last:border-b-0">
      <button
        type="button"
        onClick={() => hasDetail && setOpen(!open)}
        className={`w-full flex items-start gap-3 py-2.5 text-left rounded-r-md -ml-px pl-1 pr-1 -mr-1 transition-colors ${
          hasDetail ? "hover:bg-surface-2/50 cursor-pointer" : "cursor-default"
        }`}
      >
        <div className="shrink-0 pt-0.5">
          <OutcomeIcon kind="step" status={step.status} passed={step.passed} />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="text-sm text-gray-900 font-medium leading-snug break-words">{title}</div>
          {subtitle && (
            <div className="text-[11px] text-muted font-mono truncate" title={subtitle}>
              {subtitle}
            </div>
          )}
        </div>
        {hasDetail && (
          <span className="shrink-0 text-muted text-[10px] mt-1">{open ? "▲" : "▼"}</span>
        )}
      </button>

      {/* Inline score chips */}
      {Object.keys(scores).length > 0 && !open && (
        <div className="flex flex-wrap gap-1.5 pb-2 pl-9">
          {Object.entries(scores)
            .slice(0, 4)
            .map(([k, v]) => (
              <span
                key={k}
                className="inline-flex items-center rounded-md bg-surface-0/80 border border-surface-3/80 px-2 py-0.5 text-[10px] text-muted"
              >
                <span className="font-mono text-gray-600 mr-1">{k}</span>
                <span className="font-mono text-gray-800">
                  {typeof v === "number" ? v.toFixed(3) : String(v)}
                </span>
              </span>
            ))}
        </div>
      )}

      {open && hasDetail && (
        <div className="pb-3 pl-9 pr-2 space-y-3">
          {Object.keys(scores).length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Scores</p>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(scores).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between gap-2 bg-surface-0/90 border border-surface-3/60 rounded-md px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="text-muted font-mono truncate">{k}</span>
                    <span className="text-gray-900 font-mono shrink-0">
                      {typeof v === "number" ? v.toFixed(4) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {artifacts.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Artifacts</p>
              <div className="flex flex-wrap gap-2">
                {artifacts.map((a) => (
                  <span
                    key={a}
                    className="inline-flex items-center gap-1.5 text-[11px] bg-surface-0 border border-surface-3/60 rounded-md px-2 py-1 font-mono text-accent break-all"
                  >
                    {a}
                    <button
                      type="button"
                      className="shrink-0 text-[10px] uppercase text-muted hover:text-gray-800"
                      onClick={(e) => {
                        e.stopPropagation();
                        void navigator.clipboard.writeText(a);
                      }}
                    >
                      Copy
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {logs.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Step logs</p>
              <pre className="bg-surface-0 border border-surface-3/60 rounded-lg p-3 text-[11px] font-mono text-gray-700 overflow-x-auto max-h-40 overflow-y-auto leading-relaxed">
                {logs.join("\n")}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GateCheckRow({ gate, isLast: _isLast }: { gate: GateResult; isLast: boolean }) {
  return (
    <div className="border-b border-surface-3/40 last:border-b-0 py-2.5 flex items-start gap-3">
      <div className="shrink-0 pt-0.5">
        <OutcomeIcon kind="gate" status={gate.passed ? "passed" : "failed"} />
      </div>
      <div className="min-w-0 flex-1 text-[11px]">
        <div className="font-mono text-gray-800">{gate.key}</div>
        <div className="text-muted mt-0.5">{gate.expr}</div>
        <div className="text-muted mt-1 tabular-nums">
          value:{" "}
          <span className="text-gray-700">
            {typeof gate.value === "number" ? gate.value.toFixed(4) : gate.value}
          </span>
        </div>
      </div>
    </div>
  );
}

/** GH-style outcome glyph in a circle */
function OutcomeIcon({
  kind,
  status,
  passed,
}: {
  kind: "stage" | "step" | "gate";
  status: StageStatus;
  passed?: boolean;
}) {
  const size = kind === "stage" ? "w-6 h-6" : "w-5 h-5";

  if (status === "running") {
    return (
      <div
        className={`${size} rounded-full border-2 border-accent/60 bg-accent/10 flex items-center justify-center`}
        aria-label="Running"
      >
        <Spinner className="w-3 h-3 text-accent" />
      </div>
    );
  }

  if (status === "skipped") {
    return (
      <div
        className={`${size} rounded-full border-2 border-surface-3 bg-surface-2/80 flex items-center justify-center text-muted text-xs font-bold`}
        aria-label="Skipped"
        title="Skipped"
      >
        —
      </div>
    );
  }

  let ok = false;
  let bad = false;
  if (kind === "step") {
    ok = passed === true || (passed === undefined && status === "passed");
    bad = passed === false || (passed === undefined && status === "failed");
  } else {
    ok = status === "passed";
    bad = status === "failed";
  }

  const ringOk = "border-success/70 bg-success/15 text-success";
  const ringBad = "border-danger/70 bg-danger/15 text-danger";
  const ring = ok ? ringOk : bad ? ringBad : "border-surface-3 bg-surface-2/50 text-muted";

  if (ok) {
    return (
      <div
        className={`${size} rounded-full border-2 flex items-center justify-center text-xs font-bold leading-none ${ring}`}
        aria-label="Passed"
        title="Passed"
      >
        ✓
      </div>
    );
  }

  if (bad) {
    return (
      <div
        className={`${size} rounded-full border-2 flex items-center justify-center text-xs font-bold leading-none ${ring}`}
        aria-label="Failed"
        title="Failed"
      >
        ✗
      </div>
    );
  }

  return (
    <div
      className={`${size} rounded-full border-2 flex items-center justify-center text-[10px] ${ring}`}
      aria-label={status}
    >
      ○
    </div>
  );
}

function formatInterval(start?: string, end?: string): string | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return null;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m}m ${r}s` : `${m}m`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
