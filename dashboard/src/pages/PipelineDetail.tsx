import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { api } from "../lib/api";
import { BaselineBadge } from "../components/BaselineBadge";
import { StatusBadge } from "../components/StatusBadge";
import { PageHeaderSkeleton, SkeletonLine } from "../components/Skeleton";
import { Spinner } from "../components/Spinner";
import { RunBranchModal } from "../components/RunBranchModal";
import type { Pipeline, Run, RunStatus } from "../lib/types";

export function PipelineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: pipeline, isLoading: pipelineLoading } = useQuery({
    queryKey: ["pipeline", id],
    queryFn: () => api.pipelines.get(id!),
    enabled: !!id,
  });

  const { data: runs = [] } = useQuery({
    queryKey: ["runs", id, "enriched"],
    queryFn: () => api.pipelines.listRuns(id!, { enrich: true }),
    enabled: !!id,
    refetchInterval: 5000,
  });

  const [filterStatus, setFilterStatus] = useState<RunStatus | "all">("all");
  const [filterId, setFilterId] = useState("");
  const [runModalOpen, setRunModalOpen] = useState(false);

  const filteredRuns = useMemo(() => {
    const q = filterId.trim().toLowerCase();
    return runs.filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (q && !r.id.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [runs, filterStatus, filterId]);

  const [triggerError, setTriggerError] = useState<string | null>(null);

  const triggerMut = useMutation({
    mutationFn: (opts: { branch?: string; sha?: string }) =>
      api.pipelines.triggerRun(id!, {
        branch: opts.branch,
        sha: opts.sha,
      }),
    onMutate: () => setTriggerError(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["runs", id] });
      qc.invalidateQueries({ queryKey: ["pipelines"] });
      setTriggerError(null);
      setRunModalOpen(false);
    },
    onError: (e: Error) => setTriggerError(e.message),
  });

  const [showEdit, setShowEdit] = useState(false);
  const [editYaml, setEditYaml] = useState("");
  const [editError, setEditError] = useState("");

  const updateMut = useMutation({
    mutationFn: () => api.pipelines.update(id!, { yaml: editYaml }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline", id] });
      setShowEdit(false);
      setEditError("");
    },
    onError: (e: Error) => setEditError(e.message),
  });

  const setBaselineMut = useMutation({
    mutationFn: (runId: string) => api.pipelines.setBaseline(id!, runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline", id] });
      qc.invalidateQueries({ queryKey: ["pipelines"] });
    },
  });

  const clearBaselineMut = useMutation({
    mutationFn: () => api.pipelines.clearBaseline(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline", id] });
      qc.invalidateQueries({ queryKey: ["pipelines"] });
    },
  });

  if (pipelineLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <PageHeaderSkeleton />
        <SkeletonLine className="h-40 w-full rounded-xl" />
      </div>
    );
  }
  if (!pipeline) {
    return (
      <div className="max-w-6xl mx-auto rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-danger text-sm animate-fade-in">
        Pipeline not found.
      </div>
    );
  }

  const chartData = buildChartData(runs);
  const chartKeys = collectChartKeys(chartData);

  const gitSourceExplanation = describeGitSource(pipeline);
  const defaultBranchHint =
    pipeline.config.repository?.branch?.trim() ||
    (pipeline.repo_name ? "from server config or main" : "main");
  const usesWorkspace = Boolean(pipeline.workspace_id?.trim());

  return (
    <div className="max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <div className="ky-breadcrumb text-xs text-muted mb-5 flex items-center flex-wrap gap-x-2 gap-y-1">
        <Link to="/">Pipelines</Link>
        <span className="text-surface-3">/</span>
        <span className="text-gray-900 font-medium">{pipeline.name}</span>
      </div>

      {triggerError && (
        <div className="mb-4 rounded-xl border border-danger/35 bg-danger/10 px-4 py-3 text-danger text-xs flex justify-between items-start gap-3">
          <span>Could not start run: {triggerError}</span>
          <button
            type="button"
            className="text-muted hover:text-gray-800 shrink-0"
            onClick={() => setTriggerError(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{pipeline.name}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
            {pipeline.repo_name && (
              <span className="text-xs text-muted">
                Server repo name: <code className="text-gray-700">{pipeline.repo_name}</code>
              </span>
            )}
            <span className="text-xs text-muted">Model: {pipeline.config.agent?.model ?? "—"}</span>
            <span className="text-xs text-muted">
              {pipeline.config.pipeline?.length ?? 0} stage{pipeline.config.pipeline?.length !== 1 ? "s" : ""}
            </span>
          </div>
          {pipeline.baseline_run_id && (
            <div className="mt-2 text-xs text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Labeled baseline (default Run A):</span>
              <Link
                to={`/runs/${pipeline.baseline_run_id}`}
                className="font-mono text-amber-800 hover:text-amber-900 hover:underline"
              >
                {pipeline.baseline_run_id.slice(0, 8)}
              </Link>
              <button
                type="button"
                onClick={() => clearBaselineMut.mutate()}
                disabled={clearBaselineMut.isPending}
                className="ky-btn-secondary py-0.5 px-2 text-[11px] min-h-0"
              >
                Clear baseline
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link
            to={
              pipeline.baseline_run_id
                ? `/pipelines/${id}/compare?a=${encodeURIComponent(pipeline.baseline_run_id)}`
                : `/pipelines/${id}/compare`
            }
            className="ky-btn-secondary text-center"
          >
            Compare runs
          </Link>
          <button
            type="button"
            onClick={() => {
              setEditYaml(pipeline.yaml?.trim() ?? "");
              setEditError("");
              setShowEdit(true);
            }}
            className="ky-btn-secondary"
          >
            Edit YAML
          </button>
          <button
            type="button"
            onClick={() =>
              downloadText(
                `${sanitizeFilename(pipeline.name || "pipeline")}.yaml`,
                pipeline.yaml?.trim() ?? ""
              )
            }
            className="ky-btn-secondary"
          >
            Export YAML
          </button>
          <button
            type="button"
            onClick={() =>
              navigate("/", {
                state: {
                  cloneYaml: pipeline.yaml?.trim() ?? "",
                  suggestedName: `${pipeline.name}-copy`,
                  workspaceId: pipeline.workspace_id,
                },
              })
            }
            className="ky-btn-secondary"
          >
            Clone
          </button>
          <button
            type="button"
            onClick={() => {
              setTriggerError(null);
              setRunModalOpen(true);
            }}
            disabled={triggerMut.isPending || !id}
            className="ky-btn-primary min-w-[8rem]"
          >
            {triggerMut.isPending ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="text-white" />
                Running…
              </span>
            ) : (
              "▶ Run Now"
            )}
          </button>
        </div>
      </div>

      <RunBranchModal
        open={runModalOpen}
        onClose={() => {
          if (!triggerMut.isPending) setRunModalOpen(false);
        }}
        pipeline={pipeline}
        isRunning={triggerMut.isPending}
        runError={triggerError}
        onRun={(opts) => triggerMut.mutate(opts)}
      />

      {/* Git: source + optional ref overrides (matches engine workspace + POST /runs) */}
      <section
        className="rounded-xl border border-accent/25 bg-accent/5 px-4 py-4 mb-8"
        aria-labelledby="git-source-heading"
      >
        <h2 id="git-source-heading" className="text-sm font-semibold text-gray-900 mb-1">
          Git source &amp; what to run
        </h2>
        <p className="text-[11px] text-muted leading-relaxed mb-3">{gitSourceExplanation}</p>

        {usesWorkspace && (
          <p className="text-[11px] text-gray-800 mb-3 rounded-lg border border-surface-3/60 bg-surface-0/50 px-3 py-2">
            This pipeline uses a <strong>dashboard workspace</strong>. Click <strong>Run Now</strong> to pick the branch
            (and optional SHA). The repo URL is configured under Workspaces.
          </p>
        )}

        {pipeline.config.repository?.url && !usesWorkspace && (
          <div className="mb-3 rounded-lg border border-surface-3/60 bg-surface-0/50 px-3 py-2 text-[11px]">
            <div className="text-muted mb-0.5">Clone URL (from YAML <code className="text-gray-600">repository.url</code>)</div>
            <code className="text-gray-800 break-all leading-snug">{pipeline.config.repository.url}</code>
            {pipeline.config.repository.branch && (
              <div className="mt-2 text-muted">
                Default branch in YAML:{" "}
                <code className="text-accent">{pipeline.config.repository.branch}</code>
              </div>
            )}
            {pipeline.config.repository.token_env && (
              <div className="mt-1.5 text-muted">
                Token env: <code className="text-gray-600">{pipeline.config.repository.token_env}</code>
              </div>
            )}
          </div>
        )}

        {!usesWorkspace && (
          <>
            <p className="text-[11px] text-muted mb-2">
              Use <strong className="text-gray-700">Run Now</strong> to pass branch / SHA for this run. Leave branch empty
              for <code className="text-gray-600">{defaultBranchHint}</code>.
            </p>
            <p className="text-[10px] text-muted pt-3 border-t border-surface-3/50">
              Add <code className="text-gray-500">repository: {"{ url, branch }"}</code> to your YAML to clone a GitHub repo
              without server config. Edit YAML above, or use <strong className="text-gray-600">Repo name</strong> on the
              Pipelines page with <code className="text-gray-500">kyklos-server.yaml</code>{" "}
              <code className="text-gray-500">repos:</code>.
            </p>
          </>
        )}
      </section>

      {/* Edit modal */}
      {showEdit && (
        <div className="ky-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-yaml-title">
          <div className="ky-modal-panel max-w-2xl">
            <h2 id="edit-yaml-title" className="text-lg font-bold mb-1 text-gray-900">
              Edit Pipeline YAML
            </h2>
            <p className="text-[11px] text-muted mb-4">Changes are validated on save.</p>
            <textarea
              className="ky-textarea resize-none h-72"
              value={editYaml}
              onChange={e => setEditYaml(e.target.value)}
              placeholder="Paste updated kyklos.yaml content…"
              autoFocus
            />
            {editError && (
              <p className="text-danger text-xs mt-3 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20">
                {editError}
              </p>
            )}
            <div className="flex gap-3 mt-6 justify-end border-t border-surface-3/80 pt-5">
              <button
                type="button"
                onClick={() => { setShowEdit(false); setEditError(""); }}
                className="ky-btn-ghost"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => updateMut.mutate()}
                disabled={!editYaml || updateMut.isPending}
                className="ky-btn-primary min-w-[6rem]"
              >
                {updateMut.isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="text-white" />
                    Saving…
                  </span>
                ) : (
                  "Save"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {chartData.length > 0 && chartKeys.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-900 mb-3">Score History</h2>
          <ScoreCharts data={chartData} keys={chartKeys} />
        </div>
      )}

      {/* Run history — label one run as the compare reference (Run A default on Compare page) */}
      <h2 className="text-sm font-bold text-gray-900 mb-1 tracking-wide">Run History</h2>
      <p className="text-[11px] text-muted mb-3 max-w-2xl leading-relaxed">
        Use <span className="text-gray-700">Select as baseline</span> on a row (only one at a time) to set the default{" "}
        <strong className="text-gray-600">Run A</strong> on{" "}
        <Link
          to={
            pipeline.baseline_run_id
              ? `/pipelines/${id}/compare?a=${encodeURIComponent(pipeline.baseline_run_id)}`
              : `/pipelines/${id}/compare`
          }
          className="text-accent hover:underline"
        >
          Compare runs
        </Link>
        — the URL includes <code className="text-gray-500">?a=…</code> when a baseline is selected.
      </p>
      {runs.length === 0 ? (
        <div className="ky-card py-12 text-center text-muted text-xs animate-fade-in leading-relaxed max-w-md mx-auto">
          No runs yet — use <span className="text-gray-700">Run Now</span> after adjusting branch/SHA in{" "}
          <span className="text-gray-700">Git source &amp; what to run</span> if needed.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 mb-3 items-end">
            <div>
              <label className="block text-[11px] text-muted mb-1">Status</label>
              <select
                className="ky-input py-1.5 text-xs min-w-[8rem]"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as RunStatus | "all")}
              >
                <option value="all">All</option>
                <option value="passed">passed</option>
                <option value="failed">failed</option>
                <option value="running">running</option>
                <option value="pending">pending</option>
                <option value="cancelled">cancelled</option>
              </select>
            </div>
            <div className="flex-1 min-w-[10rem] max-w-xs">
              <label className="block text-[11px] text-muted mb-1">Run id contains</label>
              <input
                className="ky-input py-1.5 text-xs font-mono"
                placeholder="filter…"
                value={filterId}
                onChange={(e) => setFilterId(e.target.value)}
              />
            </div>
          </div>
          {filteredRuns.length === 0 ? (
            <div className="ky-card py-8 text-center text-muted text-xs">
              No runs match the current filters.
            </div>
          ) : (
            <div className="ky-card overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-3 bg-surface-0/40 text-muted">
                    <th className="text-left px-4 py-3 font-medium">Run</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Trigger</th>
                    <th className="text-left px-4 py-3 font-medium">Branch</th>
                    <th className="text-left px-4 py-3 font-medium">SHA</th>
                    <th className="text-left px-4 py-3 font-medium">Started</th>
                    <th className="text-left px-4 py-3 font-medium">Duration</th>
                    <th
                      className="text-left px-4 py-3 font-medium"
                      title="Open Compare with these runs prefilled"
                    >
                      Compare
                    </th>
                    <th
                      className="text-left px-4 py-3 font-medium"
                      title="Pick one run as baseline (Run A on Compare). Selecting another row moves the baseline."
                    >
                      Baseline
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRuns.map(run => (
                    <RunRow
                      key={run.id}
                      pipelineId={id!}
                      run={run}
                      baselineRunId={pipeline.baseline_run_id ?? ""}
                      baselineBusy={setBaselineMut.isPending || clearBaselineMut.isPending}
                      onSetBaseline={() => setBaselineMut.mutate(run.id)}
                      onClearBaseline={() => clearBaselineMut.mutate()}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function describeGitSource(p: Pipeline): string {
  if (p.workspace_id?.trim()) {
    return "Each run clones the workspace Git URL and checks out the branch you choose in the run dialog (optional SHA still wins).";
  }
  const hasInline = Boolean(p.config.repository?.url?.trim());
  const hasServer = Boolean(p.repo_name?.trim());
  if (hasInline) {
    return "Each run clones the URL below into the workspace (HTTPS tokens: GITHUB_TOKEN / KYKLOS_GIT_TOKEN or repository.token_env). Use branch or SHA to pin the ref for this run; leave branch empty to use the default from YAML.";
  }
  if (hasServer) {
    return "Runs check out your code from the server-registered repo that matches the repo name above (see kyklos-server.yaml repos:). Use branch or SHA below to override the ref for this run only.";
  }
  return "No repository: URL in YAML and no server repo name — runs use a temporary workspace and only the stored pipeline config. Add repository: { url, branch } to your YAML (Edit YAML) to clone a GitHub/Git repo, or set Repo name when creating the pipeline to use kyklos-server repos.";
}

function RunRow({
  pipelineId,
  run,
  baselineRunId,
  baselineBusy,
  onSetBaseline,
  onClearBaseline,
}: {
  pipelineId: string;
  run: Run;
  baselineRunId: string;
  baselineBusy: boolean;
  onSetBaseline: () => void;
  onClearBaseline: () => void;
}) {
  const duration = run.started_at && run.finished_at
    ? fmtDuration(new Date(run.finished_at).getTime() - new Date(run.started_at).getTime())
    : run.started_at ? "running…" : "—";

  const isBaseline = baselineRunId === run.id;

  return (
    <tr className="border-b border-surface-3/50 hover:bg-surface-2/40 transition-colors duration-150">
      <td className="px-4 py-3">
        <Link to={`/runs/${run.id}`} className="text-accent hover:text-accent/80 font-mono">
          {run.id.slice(0, 8)}
        </Link>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={run.status} />
      </td>
      <td className="px-4 py-3 text-muted">{run.trigger}</td>
      <td className="px-4 py-3">
        {run.git_branch ? (
          <code className="text-accent">{run.git_branch}</code>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {run.git_sha ? (
          <code className="text-muted">{run.git_sha.slice(0, 7)}</code>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-muted">
        {run.started_at ? fmtRelative(run.started_at) : "—"}
      </td>
      <td className="px-4 py-3 text-muted">{duration}</td>
      <td className="px-4 py-3 align-top">
        <div className="flex flex-col gap-1.5 max-w-[9rem]">
          <Link
            to={`/pipelines/${pipelineId}/compare?a=${encodeURIComponent(run.id)}`}
            className="text-[10px] text-accent hover:underline leading-snug"
          >
            Compare (A=this)
          </Link>
          {baselineRunId && baselineRunId !== run.id && (
            <Link
              to={`/pipelines/${pipelineId}/compare?a=${encodeURIComponent(baselineRunId)}&b=${encodeURIComponent(run.id)}`}
              className="text-[10px] text-emerald-800 hover:underline leading-snug"
            >
              vs baseline
            </Link>
          )}
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {isBaseline ? (
          <div className="flex flex-col gap-1.5 items-start max-w-[11rem]">
            <span className="text-[11px] text-amber-900 leading-snug">Selected as baseline</span>
            <BaselineBadge />
            <button
              type="button"
              onClick={onClearBaseline}
              disabled={baselineBusy}
              className="ky-btn-secondary py-1 px-2 text-[11px] min-h-0 w-full sm:w-auto"
            >
              Clear baseline
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSetBaseline}
            disabled={baselineBusy}
            className="ky-btn-secondary py-1.5 px-2.5 text-[11px] min-h-0 w-full sm:w-auto border-amber-600/40 text-amber-900 bg-amber-50/90 hover:bg-amber-100 font-medium"
          >
            Select as baseline
          </button>
        )}
      </td>
    </tr>
  );
}

// ── Score charts ──────────────────────────────────────────────────────────────

interface ChartPoint {
  run: string;
  [key: string]: number | string | undefined;
}

function buildChartData(runs: Run[]): ChartPoint[] {
  const ordered = runs.slice().reverse();
  const keySet = new Set<string>();
  for (const run of ordered) {
    const cm = run.chart_metrics;
    if (!cm) continue;
    for (const k of Object.keys(cm)) keySet.add(k);
  }
  const allKeys = [...keySet];
  return ordered.map((run) => {
    const point: ChartPoint = { run: run.id.slice(0, 7) };
    const cm = run.chart_metrics;
    if (!cm) return point;
    for (const k of allKeys) {
      if (cm[k] !== undefined) point[k] = cm[k];
    }
    return point;
  });
}

function collectChartKeys(data: ChartPoint[]): string[] {
  const keySet = new Set<string>();
  for (const row of data) {
    for (const k of Object.keys(row)) {
      if (k !== "run") keySet.add(k);
    }
  }
  return [...keySet];
}

const CHART_COLORS = ["#7c6af7", "#22c55e", "#ef4444", "#f59e0b", "#06b6d4", "#ec4899"];

function ScoreCharts({ data, keys }: { data: ChartPoint[]; keys: string[] }) {
  if (keys.length === 0) return null;

  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
      {keys.map((key, i) => (
        <div key={key} className="ky-card p-4">
          <p className="text-xs text-muted mb-3 font-mono">{key}</p>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={data}>
              <XAxis dataKey="run" tick={{ fontSize: 10, fill: "#6b7280" }} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#6b7280" }} width={36} />
              <Tooltip
                contentStyle={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  fontSize: 11,
                  color: "#0f172a",
                }}
                labelStyle={{ color: "#64748b" }}
              />
              <Line
                type="monotone"
                dataKey={key}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}
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

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "pipeline";
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/yaml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
