import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { RunSummary } from "../lib/types";
import { StatusBadge } from "../components/StatusBadge";
import { Spinner } from "../components/Spinner";
import type { RunStatus } from "../lib/types";

export function RunsExplorerPage() {
  const [status, setStatus] = useState<RunStatus | "">("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");

  const filters = useMemo(
    () => ({
      status: status || undefined,
      repo: repo.trim() || undefined,
      branch: branch.trim() || undefined,
      limit: 250,
    }),
    [status, repo, branch]
  );

  const { data: runs = [], isLoading, isError, error } = useQuery<RunSummary[]>({
    queryKey: ["runs", "global", filters],
    queryFn: () => api.runs.listAll(filters),
    refetchInterval: (q) => {
      const rows = q.state.data as RunSummary[] | undefined;
      if (rows?.some((r) => r.status === "running" || r.status === "pending")) {
        return 2000;
      }
      return 8000;
    },
  });

  return (
    <div className="max-w-6xl mx-auto">
      <div className="ky-breadcrumb text-xs text-muted mb-5 flex items-center flex-wrap gap-x-2 gap-y-1">
        <Link to="/">Pipelines</Link>
        <span className="text-surface-3">/</span>
        <span className="text-gray-900 font-medium">All runs</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Run explorer</h1>
      <p className="text-xs text-muted mb-6 max-w-2xl leading-relaxed">
        Recent runs across every pipeline. Filter by status, repo name, or branch substring.
      </p>

      <div className="flex flex-wrap gap-3 mb-5 items-end">
        <div>
          <label className="block text-[11px] text-muted mb-1">Status</label>
          <select
            className="ky-input py-1.5 text-xs min-w-[8rem]"
            value={status}
            onChange={(e) => setStatus(e.target.value as RunStatus | "")}
          >
            <option value="">Any</option>
            <option value="passed">passed</option>
            <option value="failed">failed</option>
            <option value="running">running</option>
            <option value="pending">pending</option>
            <option value="cancelled">cancelled</option>
          </select>
        </div>
        <div className="flex-1 min-w-[10rem] max-w-xs">
          <label className="block text-[11px] text-muted mb-1">Repo / pipeline name contains</label>
          <input
            className="ky-input py-1.5 text-xs w-full"
            placeholder="filter…"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
          />
        </div>
        <div className="flex-1 min-w-[10rem] max-w-xs">
          <label className="block text-[11px] text-muted mb-1">Branch contains</label>
          <input
            className="ky-input py-1.5 text-xs w-full"
            placeholder="filter…"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-3 text-muted py-16">
          <Spinner className="text-accent w-7 h-7" />
          Loading runs…
        </div>
      ) : isError ? (
        <p className="text-sm text-danger">{error instanceof Error ? error.message : String(error)}</p>
      ) : runs.length === 0 ? (
        <div className="ky-card py-12 text-center text-muted text-sm">No runs match the filters.</div>
      ) : (
        <div className="ky-card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-3 bg-surface-0/40 text-muted">
                <th className="text-left px-4 py-3 font-medium">Run</th>
                <th className="text-left px-4 py-3 font-medium">Pipeline</th>
                <th className="text-left px-4 py-3 font-medium">Repo</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Branch</th>
                <th className="text-left px-4 py-3 font-medium">SHA</th>
                <th className="text-left px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b border-surface-3/50 hover:bg-surface-2/30">
                  <td className="px-4 py-2.5">
                    <Link to={`/runs/${run.id}`} className="font-mono text-accent hover:underline">
                      {run.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      to={`/pipelines/${run.pipeline_id}`}
                      className="text-gray-800 hover:text-accent"
                    >
                      {run.pipeline_name || run.pipeline_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{run.pipeline_repo_name || "—"}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    {run.git_branch ? (
                      <code className="text-accent">{run.git_branch}</code>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted font-mono">
                    {run.git_sha ? run.git_sha.slice(0, 7) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{fmtTime(run.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
