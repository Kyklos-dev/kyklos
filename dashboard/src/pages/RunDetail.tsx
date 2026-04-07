import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ArtifactTree } from "../components/ArtifactTree";
import { BaselineBadge } from "../components/BaselineBadge";
import { LiveLogPanel } from "../components/LiveLogPanel";
import { StatusBadge } from "../components/StatusBadge";
import { RunWorkflowChecklist } from "../components/RunWorkflowChecklist";
import { Spinner } from "../components/Spinner";
import type { StageResult } from "../lib/types";

export function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["run", id],
    queryFn: () => api.runs.get(id!),
    enabled: !!id,
    refetchInterval: (q) => {
      const status = q.state.data?.run.status;
      return status === "running" || status === "pending" ? 1000 : false;
    },
  });

  const cancelMut = useMutation({
    mutationFn: () => api.runs.cancel(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["run", id] }),
  });

  const pipelineForBaseline = data?.run?.pipeline_id;
  const { data: pipeline } = useQuery({
    queryKey: ["pipeline", pipelineForBaseline],
    queryFn: () => api.pipelines.get(pipelineForBaseline!),
    enabled: !!pipelineForBaseline,
  });

  const setBaselineMut = useMutation({
    mutationFn: () => {
      const pid = data?.run?.pipeline_id;
      const rid = data?.run?.id;
      if (!pid || !rid) throw new Error("missing run");
      return api.pipelines.setBaseline(pid, rid);
    },
    onSuccess: () => {
      if (pipelineForBaseline) {
        qc.invalidateQueries({ queryKey: ["pipeline", pipelineForBaseline] });
      }
      qc.invalidateQueries({ queryKey: ["pipelines"] });
    },
  });

  const rerunMut = useMutation({
    mutationFn: () => api.runs.rerun(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["run", id] });
      qc.invalidateQueries({ queryKey: ["runs"] });
      qc.invalidateQueries({ queryKey: ["pipelines"] });
    },
  });

  const clearBaselineMut = useMutation({
    mutationFn: () => {
      const pid = data?.run?.pipeline_id;
      if (!pid) throw new Error("missing run");
      return api.pipelines.clearBaseline(pid);
    },
    onSuccess: () => {
      if (pipelineForBaseline) {
        qc.invalidateQueries({ queryKey: ["pipeline", pipelineForBaseline] });
      }
      qc.invalidateQueries({ queryKey: ["pipelines"] });
    },
  });

  const stages = data?.stages ?? [];

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto flex flex-col items-center justify-center py-24 gap-4 text-muted animate-fade-in">
        <Spinner className="text-accent w-8 h-8" />
        <p className="text-xs">Loading run…</p>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="max-w-6xl mx-auto rounded-xl border border-danger/30 bg-danger/5 px-5 py-4 animate-fade-in">
        <p className="font-medium text-danger text-sm">Could not load run</p>
        <p className="text-muted text-xs mt-2 leading-relaxed">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }
  if (!data?.run) {
    return (
      <div className="max-w-6xl mx-auto rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-danger text-sm">
        Run not found.
      </div>
    );
  }

  const run = data.run;
  const pipelineId = run.pipeline_id;
  const artifacts = data.artifacts ?? [];
  const isBaseline = pipeline?.baseline_run_id === run.id;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <div className="ky-breadcrumb text-xs text-muted mb-5 flex items-center flex-wrap gap-x-2 gap-y-1">
        <Link to="/">Pipelines</Link>
        <span className="text-surface-3">/</span>
        <Link to={`/pipelines/${pipelineId}`}>{pipelineId.slice(0, 8)}</Link>
        <span className="text-surface-3">/</span>
        <span className="text-gray-900 font-medium">run {run.id.slice(0, 8)}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold font-mono text-gray-900 tracking-tight">
              {run.id.slice(0, 8)}
            </h1>
            <StatusBadge status={run.status} />
            {isBaseline && <BaselineBadge />}
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-muted">
            <span>trigger: <span className="text-gray-700">{run.trigger}</span></span>
            {run.git_branch && <span>branch: <code className="text-accent">{run.git_branch}</code></span>}
            {run.git_sha && <span>sha: <code className="text-muted">{run.git_sha.slice(0, 7)}</code></span>}
            {run.started_at && <span>started: <span className="text-gray-700">{fmtRelative(run.started_at)}</span></span>}
            {run.started_at && run.finished_at && (
              <span>duration: <span className="text-gray-700">{fmtDuration(run)}</span></span>
            )}
          </div>
          {(run.eval_bundle_fingerprint || run.eval_bundle_id) && (
            <div className="mt-3 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2.5 text-xs text-left">
              <div className="text-muted font-semibold uppercase tracking-wide mb-1.5">
                Eval bundle
              </div>
              {run.eval_bundle_id && (
                <div className="text-gray-800 mb-1">
                  id: <code className="text-accent">{run.eval_bundle_id}</code>
                </div>
              )}
              {run.eval_bundle_fingerprint && (
                <div className="text-gray-700 font-mono break-all leading-relaxed">
                  fingerprint: {run.eval_bundle_fingerprint}
                </div>
              )}
            </div>
          )}
          {run.error_msg && (
            <p className="mt-3 text-xs text-danger bg-danger/10 border border-danger/25 rounded-lg px-3 py-2.5 leading-relaxed">
              {run.error_msg}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0 justify-end">
          {isBaseline ? (
            <button
              type="button"
              onClick={() => clearBaselineMut.mutate()}
              disabled={clearBaselineMut.isPending}
              className="ky-btn-secondary border-amber-600/35 text-amber-900 bg-amber-50/90 hover:bg-amber-100"
            >
              {clearBaselineMut.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-amber-800" />
                  Updating…
                </span>
              ) : (
                "Clear baseline"
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setBaselineMut.mutate()}
              disabled={setBaselineMut.isPending}
              className="ky-btn-secondary"
            >
              {setBaselineMut.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-accent" />
                  Updating…
                </span>
              ) : (
                "Select as baseline"
              )}
            </button>
          )}
          {pipeline?.baseline_run_id && pipeline.baseline_run_id !== run.id && (
            <Link
              to={`/pipelines/${pipelineId}/compare?a=${encodeURIComponent(pipeline.baseline_run_id)}&b=${encodeURIComponent(run.id)}`}
              className="ky-btn-secondary text-center border-emerald-600/35 text-emerald-900 bg-emerald-50/80 hover:bg-emerald-100"
            >
              Compare to baseline
            </Link>
          )}
          <Link
            to={`/pipelines/${pipelineId}/compare?a=${encodeURIComponent(run.id)}`}
            className="ky-btn-secondary text-center"
          >
            Compare (Run A=this)
          </Link>
          <button
            type="button"
            onClick={() => rerunMut.mutate()}
            disabled={rerunMut.isPending}
            className="ky-btn-secondary"
          >
            {rerunMut.isPending ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="text-accent" />
                Re-running…
              </span>
            ) : (
              "Re-run (same ref)"
            )}
          </button>
          <button
            type="button"
            onClick={() =>
              downloadJson(`run-${run.id}.json`, data)
            }
            className="ky-btn-secondary"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => downloadMetricsCsv(`run-${run.id}-metrics.csv`, stages)}
            disabled={stages.length === 0}
            className="ky-btn-secondary disabled:opacity-40"
          >
            Export metrics CSV
          </button>
          {(run.status === "running" || run.status === "pending") && (
            <button
              type="button"
              onClick={() => cancelMut.mutate()}
              disabled={cancelMut.isPending}
              className="ky-btn-secondary border-danger/35 text-danger hover:bg-danger/10 hover:border-danger/50 shrink-0"
            >
              {cancelMut.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-danger" />
                  Cancelling…
                </span>
              ) : (
                "Cancel Run"
              )}
            </button>
          )}
        </div>
      </div>

      {/* GitHub Actions–style workflow: all stages & steps with ✓ / ✗ */}
      {stages.length > 0 && (
        <div className="mb-8">
          <RunWorkflowChecklist stages={stages} />
        </div>
      )}

      {artifacts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-gray-900 mb-3 tracking-wide flex items-center gap-2">
            <DownloadIcon className="w-4 h-4 text-accent shrink-0" aria-hidden />
            Artifact browser
          </h2>
          <p className="text-[11px] text-muted mb-3 max-w-xl">
            Files persisted from steps (grouped by stage and step). Click a file to download.
          </p>
          <ArtifactTree runId={run.id} artifacts={artifacts} />
        </div>
      )}

      {/* Live SSE log stream */}
      <div className="mt-8">
        <h2 className="text-sm font-bold text-gray-900 mb-3 tracking-wide">Logs</h2>
        <LiveLogPanel
          runId={run.id}
          isLive={run.status === "running" || run.status === "pending"}
        />
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function DownloadIcon({ className, "aria-hidden": ariaHidden }: { className?: string; "aria-hidden"?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function fmtDuration(run: { started_at?: string; finished_at?: string }): string {
  if (!run.started_at || !run.finished_at) return "—";
  const ms = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function downloadMetricsCsv(filename: string, stages: StageResult[]): void {
  const lines = ["metric,value"];
  for (const st of stages) {
    for (const step of st.steps) {
      const prefix = `${st.stage_name}.${step.name}.`;
      for (const [k, v] of Object.entries(step.scores)) {
        const cell = `${prefix}${k}`.split('"').join('""');
        lines.push(`"${cell}",${v}`);
      }
    }
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJson(filename: string, obj: unknown): void {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
