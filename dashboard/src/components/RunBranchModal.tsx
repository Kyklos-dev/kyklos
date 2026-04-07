import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Spinner } from "./Spinner";
import type { Pipeline } from "../lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  pipeline: Pipeline;
  onRun: (opts: { branch?: string; sha?: string }) => void;
  isRunning: boolean;
  runError: string | null;
};

export function RunBranchModal({
  open,
  onClose,
  pipeline,
  onRun,
  isRunning,
  runError,
}: Props) {
  const qc = useQueryClient();
  const wsId = pipeline.workspace_id?.trim() ?? "";

  const { data: workspace, isLoading: wsLoading } = useQuery({
    queryKey: ["workspace", wsId],
    queryFn: () => api.workspaces.get(wsId),
    enabled: open && Boolean(wsId),
  });

  const [branch, setBranch] = useState("");
  const [sha, setSha] = useState("");

  useEffect(() => {
    if (!open) return;
    setSha("");
    if (wsId && workspace) {
      setBranch(workspace.default_branch || workspace.branches?.[0] || "main");
    } else {
      setBranch(
        pipeline.config.repository?.branch?.trim() ||
          (pipeline.repo_name ? "main" : "")
      );
    }
  }, [open, wsId, workspace, pipeline]);

  const scanMut = useMutation({
    mutationFn: () => api.workspaces.scanBranches(wsId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace", wsId] });
    },
  });

  if (!open) return null;

  const hasBranches = Boolean(workspace?.branches?.length);

  return (
    <div className="ky-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="run-branch-title">
      <div className="ky-modal-panel max-w-md">
        <h2 id="run-branch-title" className="text-lg font-bold mb-1 text-gray-900">
          Run pipeline
        </h2>
        <p className="text-[11px] text-muted mb-4">
          {wsId
            ? "Choose the Git branch to check out for this run (workspace clone)."
            : "Optional branch and commit. Leave branch empty to use the default from YAML or server config."}
        </p>

        {wsId && wsLoading && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}

        {wsId && !wsLoading && (
          <div className="space-y-3 mb-4">
            <label className="block text-xs text-gray-700 font-medium">Branch</label>
            {hasBranches ? (
              <select
                className="ky-input font-mono text-gray-800 py-2"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              >
                {workspace!.branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="ky-input font-mono text-gray-800 py-2"
                placeholder="e.g. main"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                autoComplete="off"
              />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="ky-btn-secondary text-[11px] py-1.5 px-3"
                disabled={scanMut.isPending}
                onClick={() => scanMut.mutate()}
              >
                {scanMut.isPending ? "Scanning…" : "Refresh branches"}
              </button>
              {scanMut.isError && (
                <span className="text-[10px] text-danger">{(scanMut.error as Error).message}</span>
              )}
            </div>
            {!hasBranches && (
              <p className="text-[10px] text-muted">
                No branches cached yet — use Refresh (runs <code className="text-gray-600">git ls-remote</code> on
                the server) or type a branch name.
              </p>
            )}
          </div>
        )}

        {!wsId && (
          <div className="mb-4">
            <label className="block text-xs text-gray-700 font-medium mb-1.5">Branch (optional)</label>
            <input
              type="text"
              className="ky-input font-mono text-gray-800 py-2 w-full"
              placeholder="e.g. main"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs text-gray-700 font-medium mb-1.5">Commit SHA (optional)</label>
          <input
            type="text"
            className="ky-input font-mono text-gray-800 py-2 w-full"
            placeholder="If set, checks out this commit instead of branch tip"
            value={sha}
            onChange={(e) => setSha(e.target.value)}
            autoComplete="off"
          />
        </div>

        {runError && (
          <p className="text-danger text-xs mb-3 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20">
            {runError}
          </p>
        )}

        <div className="flex gap-3 justify-end border-t border-surface-3/80 pt-4">
          <button type="button" className="ky-btn-ghost" onClick={onClose} disabled={isRunning}>
            Cancel
          </button>
          <button
            type="button"
            className="ky-btn-primary min-w-[6rem]"
            disabled={isRunning || Boolean(wsId && wsLoading)}
            onClick={() =>
              onRun({
                branch: branch.trim() || undefined,
                sha: sha.trim() || undefined,
              })
            }
          >
            {isRunning ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="text-white" />
                Starting…
              </span>
            ) : (
              "Run"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
