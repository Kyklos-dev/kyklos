import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { PipelineBuilder } from "../components/PipelineBuilder";
import { PipelineListSkeleton } from "../components/Skeleton";
import { Spinner } from "../components/Spinner";
import { RunBranchModal } from "../components/RunBranchModal";
import { useWorkspaceContext } from "../lib/WorkspaceContext";
import type { Pipeline, Run } from "../lib/types";

export function PipelinesPage() {
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { workspaceId, setWorkspaceId } = useWorkspaceContext();
  const { data: pipelines = [], isLoading } = useQuery({
    queryKey: ["pipelines", workspaceId],
    queryFn: () =>
      workspaceId
        ? api.pipelines.list({ workspace_id: workspaceId })
        : api.pipelines.list(),
    refetchInterval: 5000,
  });

  const [showNew, setShowNew] = useState(false);
  const [createTab, setCreateTab] = useState<"visual" | "yaml">("visual");
  const [builderYaml, setBuilderYaml] = useState("");
  const [manualYaml, setManualYaml] = useState("");
  const [builderKey, setBuilderKey] = useState(0);
  const [repoName, setRepoName] = useState("");
  const [createWorkspaceId, setCreateWorkspaceId] = useState("");
  const [createMode, setCreateMode] = useState<"from_repo" | "freestyle">("freestyle");
  const [repoFileBranch, setRepoFileBranch] = useState("");
  const [repoFilePath, setRepoFilePath] = useState("kyklos.yaml");
  const [createError, setCreateError] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: api.workspaces.list,
  });

  const { data: createWsDetail } = useQuery({
    queryKey: ["workspace", createWorkspaceId],
    queryFn: () => api.workspaces.get(createWorkspaceId),
    enabled: showNew && Boolean(createWorkspaceId.trim()),
  });

  useEffect(() => {
    if (showNew) {
      setCreateWorkspaceId(workspaceId);
    }
  }, [showNew, workspaceId]);

  useEffect(() => {
    setRepoFileBranch("");
  }, [createWorkspaceId]);

  useEffect(() => {
    if (!createWsDetail?.default_branch) return;
    setRepoFileBranch((prev) => (prev === "" ? createWsDetail.default_branch : prev));
  }, [createWsDetail]);

  useEffect(() => {
    const st = location.state as {
      cloneYaml?: string;
      suggestedName?: string;
      workspaceId?: string;
    } | undefined;
    if (st?.cloneYaml !== undefined) {
      setManualYaml(st.cloneYaml);
      if (st.suggestedName) setRepoName(st.suggestedName);
      if (st.workspaceId) setWorkspaceId(st.workspaceId);
      setCreateTab("yaml");
      setShowNew(true);
      navigate("/", { replace: true, state: undefined });
    }
  }, [location.state, navigate, setWorkspaceId]);

  const onBuilderYaml = useCallback((y: string) => {
    setBuilderYaml(y);
  }, []);

  const loadRepoFileMut = useMutation({
    mutationFn: () =>
      api.workspaces.getFile(createWorkspaceId, {
        branch: repoFileBranch.trim() || undefined,
        path: repoFilePath.trim() || undefined,
      }),
    onSuccess: (data) => {
      setManualYaml(data.content);
      setCreateError("");
    },
    onError: (e: Error) => setCreateError(e.message),
  });

  const createMut = useMutation({
    mutationFn: () => {
      const yamlBody =
        createMode === "from_repo"
          ? manualYaml
          : createTab === "visual"
            ? builderYaml
            : manualYaml;
      return api.pipelines.create(yamlBody, {
        repo_name: repoName,
        workspace_id: createWorkspaceId.trim(),
      });
    },
    onSuccess: (pipeline) => {
      qc.invalidateQueries({ queryKey: ["pipelines"] });
      setShowNew(false);
      setBuilderYaml("");
      setManualYaml("");
      setCreateTab("visual");
      setCreateMode("freestyle");
      setRepoFilePath("kyklos.yaml");
      setBuilderKey((k) => k + 1);
      setRepoName("");
      setCreateWorkspaceId("");
      setCreateError("");
      if (pipeline?.id) {
        navigate(`/pipelines/${pipeline.id}`);
      }
    },
    onError: (e: Error) => setCreateError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.pipelines.delete(id),
    onSuccess: () => {
      setDeleteError(null);
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["pipelines"] });
    },
    onError: (e: Error) => setDeleteError(e.message),
  });

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      {deleteError && (
        <div className="mb-4 rounded-xl border border-danger/35 bg-danger/10 px-4 py-3 text-danger text-xs flex justify-between items-start gap-3 animate-fade-in">
          <span>{deleteError}</span>
          <button type="button" className="text-muted hover:text-gray-800 shrink-0" onClick={() => setDeleteError(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Pipelines</h1>
          <p className="text-muted text-xs mt-1.5">
            {pipelines.length} pipeline{pipelines.length !== 1 ? "s" : ""}
            {workspaceId ? " in this workspace" : " (all workspaces)"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateMode("freestyle");
            setCreateTab("visual");
            setManualYaml("");
            setRepoFilePath("kyklos.yaml");
            setBuilderKey((k) => k + 1);
            setCreateWorkspaceId(workspaceId);
            setShowNew(true);
          }}
          className="ky-btn-primary self-start sm:self-auto"
        >
          + New Pipeline
        </button>
      </div>

      {/* Confirm delete pipeline */}
      {pendingDelete && (
        <div className="ky-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title">
          <div className="ky-modal-panel max-w-md">
            <h2 id="confirm-delete-title" className="text-lg font-bold mb-2 text-gray-900">
              Delete pipeline?
            </h2>
            <p className="text-xs text-muted leading-relaxed mb-1">
              <span className="text-gray-800 font-medium">{pendingDelete.name}</span> and all of its runs and logs
              will be removed permanently.
            </p>
            <div className="flex gap-3 mt-6 justify-end border-t border-surface-3/80 pt-5">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="ky-btn-ghost"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMut.mutate(pendingDelete.id)}
                disabled={deleteMut.isPending}
                className="inline-flex items-center px-4 py-2 text-xs font-medium rounded-lg border border-danger/50 text-danger bg-danger/10 hover:bg-danger/20 transition-colors disabled:opacity-50"
              >
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New pipeline modal */}
      {showNew && (
        <div className="ky-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="new-pipeline-title">
          <div className="ky-modal-panel max-w-4xl">
            <h2 id="new-pipeline-title" className="text-lg font-bold mb-1 text-gray-900">
              New Pipeline
            </h2>
            <p className="text-[11px] text-muted mb-4">
              Choose a workspace, then either load an existing Kyklos file from a branch or design the pipeline with the
              builder.
            </p>
            <label className="block text-xs text-muted mb-1.5">Workspace</label>
            <select
              className="ky-input mb-1"
              value={createWorkspaceId}
              onChange={(e) => setCreateWorkspaceId(e.target.value)}
            >
              <option value="">Select workspace…</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted leading-relaxed mb-4">
              Runs clone this workspace&apos;s public Git URL; you pick the branch when starting a run. Add URLs under{" "}
              <Link to="/workspaces" className="text-accent hover:underline">
                Workspaces
              </Link>
              .
            </p>
            <label className="block text-xs text-muted mb-1.5">Server repo name (optional)</label>
            <input
              className="ky-input mb-1"
              placeholder="my-agent"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
            />
            <p className="text-[10px] text-muted leading-relaxed mb-4">
              Must match a <code className="text-gray-500">repos:</code> entry in{" "}
              <code className="text-gray-500">kyklos-server.yaml</code> for webhooks. Leave empty when using only a
              workspace URL.
            </p>

            <div className="flex flex-wrap gap-4 mb-4">
              <label className="flex items-center gap-2 text-xs text-gray-800 cursor-pointer">
                <input
                  type="radio"
                  name="kyklos-create-mode"
                  className="accent-indigo-600"
                  checked={createMode === "from_repo"}
                  disabled={!createWorkspaceId.trim()}
                  onChange={() => setCreateMode("from_repo")}
                />
                From repository
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-800 cursor-pointer">
                <input
                  type="radio"
                  name="kyklos-create-mode"
                  className="accent-indigo-600"
                  checked={createMode === "freestyle"}
                  onChange={() => setCreateMode("freestyle")}
                />
                Freestyle (visual builder or raw YAML)
              </label>
            </div>

            {createMode === "from_repo" && !createWorkspaceId.trim() && (
              <p className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200/80 rounded-lg px-3 py-2 mb-4">
                Select a workspace to load a file from Git.
              </p>
            )}

            {createMode === "from_repo" && createWorkspaceId.trim() && (
              <div className="rounded-xl border border-surface-3/80 bg-surface-0/50 p-4 mb-5 space-y-3">
                <p className="text-xs font-medium text-gray-800">Load Kyklos file from branch</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-muted mb-1">Branch</label>
                    {createWsDetail?.branches && createWsDetail.branches.length > 0 ? (
                      <select
                        className="ky-input font-mono text-xs py-2 w-full"
                        value={repoFileBranch}
                        onChange={(e) => setRepoFileBranch(e.target.value)}
                      >
                        {createWsDetail.branches.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="ky-input font-mono text-xs py-2 w-full"
                        placeholder="e.g. main"
                        value={repoFileBranch}
                        onChange={(e) => setRepoFileBranch(e.target.value)}
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] text-muted mb-1">File path in repo</label>
                    <input
                      className="ky-input font-mono text-xs py-2 w-full"
                      placeholder="kyklos.yaml"
                      value={repoFilePath}
                      onChange={(e) => setRepoFilePath(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="ky-btn-secondary text-[11px] py-1.5 px-3"
                  disabled={loadRepoFileMut.isPending}
                  onClick={() => loadRepoFileMut.mutate()}
                >
                  {loadRepoFileMut.isPending ? "Loading…" : "Load file into editor"}
                </button>
                <p className="text-[10px] text-muted">
                  Uses the same server Git cache as runs. If the branch list is empty, open{" "}
                  <Link to="/workspaces" className="text-accent hover:underline">
                    Workspaces
                  </Link>{" "}
                  and run <strong>Scan branches</strong>.
                </p>
                <label className="block text-xs text-muted mb-1.5">Pipeline YAML (edit after load)</label>
                <textarea
                  className="ky-textarea h-56"
                  placeholder='Click "Load file into editor", or paste YAML here…'
                  value={manualYaml}
                  onChange={(e) => setManualYaml(e.target.value)}
                />
              </div>
            )}

            {createMode === "freestyle" && (
              <>
                <div className="flex gap-1 p-1 mb-5 rounded-xl bg-surface-0/80 border border-surface-3/80 w-fit">
                  <button
                    type="button"
                    onClick={() => setCreateTab("visual")}
                    className={`px-4 py-2 text-xs rounded-lg transition-all duration-200 ${
                      createTab === "visual"
                        ? "bg-surface-2 text-gray-900 shadow-ky border border-surface-3/80"
                        : "text-muted hover:text-gray-800"
                    }`}
                  >
                    Visual builder
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManualYaml((prev) => prev || builderYaml);
                      setCreateTab("yaml");
                    }}
                    className={`px-4 py-2 text-xs rounded-lg transition-all duration-200 ${
                      createTab === "yaml"
                        ? "bg-surface-2 text-gray-900 shadow-ky border border-surface-3/80"
                        : "text-muted hover:text-gray-800"
                    }`}
                  >
                    Raw YAML
                  </button>
                </div>

                {createTab === "visual" ? (
                  <PipelineBuilder key={builderKey} onYamlChange={onBuilderYaml} />
                ) : (
                  <>
                    <label className="block text-xs text-muted mb-1.5">kyklos.yaml</label>
                    <textarea
                      className="ky-textarea h-72"
                      placeholder={`version: "1.0"\nname: my-agent\n...`}
                      value={manualYaml}
                      onChange={(e) => setManualYaml(e.target.value)}
                    />
                    <p className="text-[11px] text-muted mt-2 leading-relaxed">
                      Paste a full pipeline file. Switch back to Visual builder to discard manual YAML and start from the
                      template.
                    </p>
                  </>
                )}
              </>
            )}

            {createError && (
              <p className="text-danger text-xs mt-3 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20">
                {createError}
              </p>
            )}
            <div className="flex gap-3 mt-6 justify-end border-t border-surface-3/80 pt-5">
              <button
                type="button"
                onClick={() => {
                  setShowNew(false);
                  setCreateError("");
                  setCreateMode("freestyle");
                }}
                className="ky-btn-ghost"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!createWorkspaceId.trim()) {
                    setCreateError("Choose a workspace — each pipeline belongs to one Git repo.");
                    return;
                  }
                  setCreateError("");
                  createMut.mutate();
                }}
                disabled={
                  createMut.isPending ||
                  loadRepoFileMut.isPending ||
                  !createWorkspaceId.trim() ||
                  (createMode === "freestyle" && createTab === "visual" && !builderYaml.trim()) ||
                  (createMode === "freestyle" && createTab === "yaml" && !manualYaml.trim()) ||
                  (createMode === "from_repo" && !manualYaml.trim())
                }
                className="ky-btn-primary min-w-[7rem]"
              >
                {createMut.isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="text-white" />
                    Creating…
                  </span>
                ) : (
                  "Create"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pipeline list */}
      {isLoading ? (
        <PipelineListSkeleton rows={5} />
      ) : pipelines.length === 0 ? (
        <div className="ky-card text-center py-16 px-6 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-surface-2 border border-surface-3 text-2xl mb-5 text-accent/80">
            ⟳
          </div>
          <p className="text-gray-800 text-sm font-medium mb-1">No pipelines yet</p>
          <p className="text-muted text-xs max-w-sm mx-auto leading-relaxed">
            Create a pipeline with the visual builder or paste a{" "}
            <code className="text-accent/90">kyklos.yaml</code> to register an agent.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {pipelines.map((p, i) => (
            <div
              key={p.id}
              className="animate-slide-up-fade"
              style={{ animationDelay: `${Math.min(i * 45, 400)}ms` }}
            >
              <PipelineCard
                pipeline={p}
                deleteInProgress={deleteMut.isPending && deleteMut.variables === p.id}
                deleteLocked={deleteMut.isPending}
                onRequestDelete={() => setPendingDelete({ id: p.id, name: p.name })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PipelineCard({
  pipeline,
  onRequestDelete,
  deleteInProgress,
  deleteLocked,
}: {
  pipeline: Pipeline;
  onRequestDelete: () => void;
  deleteInProgress: boolean;
  deleteLocked: boolean;
}) {
  const qc = useQueryClient();
  const [runErr, setRunErr] = useState<string | null>(null);
  const [runModalOpen, setRunModalOpen] = useState(false);
  const { data: runs = [] } = useQuery({
    queryKey: ["runs", pipeline.id],
    queryFn: () => api.pipelines.listRuns(pipeline.id),
    refetchInterval: 5000,
  });

  const triggerMut = useMutation({
    mutationFn: (opts: { branch?: string; sha?: string }) =>
      api.pipelines.triggerRun(pipeline.id, {
        branch: opts.branch,
        sha: opts.sha,
      }),
    onMutate: () => setRunErr(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["runs", pipeline.id] });
      qc.invalidateQueries({ queryKey: ["pipelines"] });
      setRunModalOpen(false);
    },
    onError: (e: Error) => setRunErr(e.message),
  });

  const lastRun: Run | undefined = runs[0];
  const recentRuns = runs.slice(0, 10);

  return (
    <div className="ky-card p-5 md:p-6 group">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            to={`/pipelines/${pipeline.id}`}
            className="text-base font-bold text-gray-900 hover:text-accent transition-colors duration-200 group-hover:text-accent/95"
          >
            {pipeline.name}
          </Link>
          <div className="flex items-center gap-3 mt-1">
            {pipeline.workspace_id && (
              <span className="text-[10px] text-muted font-mono" title="Workspace id">
                ws:{pipeline.workspace_id.slice(0, 8)}…
              </span>
            )}
            {pipeline.repo_name && (
              <span className="text-xs text-muted">{pipeline.repo_name}</span>
            )}
            <span className="text-xs text-muted">
              {pipeline.config.agent?.model ?? "—"}
            </span>
            <span className="text-xs text-muted">
              {(pipeline.config.pipeline?.length ?? 0)} stage{pipeline.config.pipeline?.length !== 1 ? "s" : ""}
            </span>
          </div>
          {pipeline.baseline_run_id && (
            <div className="mt-1.5 text-[11px] text-muted">
              Baseline:{" "}
              <Link
                to={`/runs/${pipeline.baseline_run_id}`}
                className="font-mono text-amber-800 hover:text-amber-900 hover:underline"
              >
                {pipeline.baseline_run_id.slice(0, 8)}
              </Link>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Sparkline of last 10 runs — each bar links to its run */}
          <div className="flex items-end gap-0.5 h-6">
            {recentRuns.slice().reverse().map((r, i) => (
              <Link
                key={i}
                to={`/runs/${r.id}`}
                className={`w-1.5 rounded-sm block hover:opacity-70 transition-opacity ${
                  r.status === "passed" ? "bg-success" :
                  r.status === "failed" ? "bg-danger" :
                  r.status === "running" ? "bg-accent animate-pulse" :
                  "bg-surface-3"
                }`}
                style={{ height: `${Math.max(30, Math.min(100, 50 + i * 5))}%` }}
                title={`${r.status} — ${r.trigger}`}
              />
            ))}
          </div>

          {lastRun && (
            <Link to={`/runs/${lastRun.id}`}>
              <StatusBadge status={lastRun.status} />
            </Link>
          )}

          <button
            type="button"
            onClick={() => {
              setRunErr(null);
              setRunModalOpen(true);
            }}
            disabled={triggerMut.isPending}
            className="ky-btn-secondary px-3 py-1.5 text-[11px] min-w-[4.5rem] disabled:pointer-events-none"
          >
            ▶ Run
          </button>

          <RunBranchModal
            open={runModalOpen}
            onClose={() => {
              if (!triggerMut.isPending) setRunModalOpen(false);
            }}
            pipeline={pipeline}
            isRunning={triggerMut.isPending}
            runError={runErr}
            onRun={(opts) => triggerMut.mutate(opts)}
          />

          <button
            type="button"
            onClick={onRequestDelete}
            disabled={deleteLocked}
            className="inline-flex items-center px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-danger/40 text-danger/95 bg-transparent hover:bg-danger/10 hover:border-danger/55 transition-colors duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
          >
            {deleteInProgress ? "…" : "Delete"}
          </button>
        </div>
      </div>

      {runErr && (
        <p className="mt-2 text-[11px] text-danger leading-snug" role="alert">
          Run failed: {runErr}
        </p>
      )}

      {lastRun && (
        <div className="mt-3 text-xs text-muted flex items-center gap-3">
          <Link to={`/runs/${lastRun.id}`} className="hover:text-gray-900 transition-colors">
            Last run: <span className="text-gray-700">{fmtRelative(lastRun.created_at)}</span>
          </Link>
          {lastRun.git_branch && <span>branch: <code className="text-accent">{lastRun.git_branch}</code></span>}
          {lastRun.git_sha && <span>sha: <code className="text-muted">{lastRun.git_sha.slice(0, 7)}</code></span>}
        </div>
      )}
    </div>
  );
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
