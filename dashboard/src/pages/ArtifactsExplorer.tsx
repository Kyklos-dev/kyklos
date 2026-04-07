import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ArtifactListItem } from "../lib/types";
import { StatusBadge } from "../components/StatusBadge";
import { Spinner } from "../components/Spinner";

export function ArtifactsExplorerPage() {
  const [q, setQ] = useState("");
  const [pipeline, setPipeline] = useState("");

  const filters = useMemo(
    () => ({
      q: q.trim() || undefined,
      pipeline: pipeline.trim() || undefined,
      limit: 500,
    }),
    [q, pipeline]
  );

  const { data: rows = [], isLoading, isError, error } = useQuery({
    queryKey: ["artifacts", "global", filters],
    queryFn: () => api.artifacts.list(filters),
    refetchInterval: 12_000,
  });

  const totalBytes = useMemo(
    () => rows.reduce((acc, a) => acc + (a.size_bytes || 0), 0),
    [rows]
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="ky-breadcrumb text-xs text-muted mb-5 flex items-center flex-wrap gap-x-2 gap-y-1">
        <Link to="/">Pipelines</Link>
        <span className="text-surface-3">/</span>
        <span className="text-stone-900 font-medium">Artifacts</span>
      </div>

      <section className="ky-card rounded-2xl p-6 md:p-8 mb-8 border-stone-200/90 bg-gradient-to-br from-[#fafaf8] via-[#f7f5f2] to-[#f0ebe4] shadow-ky-lg">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-700/80 mb-2">
              Outputs
            </p>
            <h1 className="text-2xl md:text-[1.65rem] font-bold text-stone-900 tracking-tight mb-2">
              Artifact library
            </h1>
            <p className="text-xs text-muted max-w-xl leading-relaxed">
              Files persisted from pipeline steps (reports, snapshots, bundles). Download any file or open its run to
              see full context and logs.
            </p>
          </div>
          <div className="flex gap-4 shrink-0">
            <div className="rounded-xl border border-stone-200/80 bg-white/70 px-4 py-3 min-w-[6.5rem]">
              <div className="text-[10px] uppercase tracking-wider text-muted">Files</div>
              <div className="text-lg font-bold tabular-nums text-stone-900">{rows.length}</div>
            </div>
            <div className="rounded-xl border border-stone-200/80 bg-white/70 px-4 py-3 min-w-[6.5rem]">
              <div className="text-[10px] uppercase tracking-wider text-muted">Total size</div>
              <div className="text-lg font-bold tabular-nums text-stone-900">{fmtBytes(totalBytes)}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div className="flex-1 min-w-[12rem] max-w-md">
          <label className="block text-[11px] text-muted mb-1">File or step contains</label>
          <input
            className="ky-input py-2 text-xs w-full"
            placeholder="e.g. report, snapshot…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex-1 min-w-[12rem] max-w-md">
          <label className="block text-[11px] text-muted mb-1">Pipeline name or repo</label>
          <input
            className="ky-input py-2 text-xs w-full"
            placeholder="filter…"
            value={pipeline}
            onChange={(e) => setPipeline(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-3 text-muted py-16">
          <Spinner className="text-accent w-7 h-7" />
          Loading artifacts…
        </div>
      ) : isError ? (
        <p className="text-sm text-danger">{error instanceof Error ? error.message : String(error)}</p>
      ) : rows.length === 0 ? (
        <div className="ky-card py-14 px-6 text-center">
          <div
            className="w-11 h-11 rounded-2xl border-2 border-dashed border-stone-300/90 mx-auto mb-4 bg-stone-100/40"
            aria-hidden
          />
          <p className="text-sm text-stone-800 font-medium mb-1">No artifacts yet</p>
          <p className="text-xs text-muted max-w-md mx-auto leading-relaxed">
            Run a pipeline whose steps emit files to <code className="text-stone-600">artifacts</code>. They appear here
            with durable download links.
          </p>
        </div>
      ) : (
        <div className="ky-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-100/50 text-muted">
                  <th className="text-left px-4 py-3 font-medium">File</th>
                  <th className="text-left px-4 py-3 font-medium">Size</th>
                  <th className="text-left px-4 py-3 font-medium">Stage · step</th>
                  <th className="text-left px-4 py-3 font-medium">Pipeline</th>
                  <th className="text-left px-4 py-3 font-medium">Run</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Created</th>
                  <th className="text-right px-4 py-3 font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <ArtifactRow key={`${a.run_id}-${a.id}`} a={a} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ArtifactRow({ a }: { a: ArtifactListItem }) {
  const name = a.logical_name || a.step_name || "artifact";
  const downloadHref = `/api/v1/runs/${a.run_id}/artifacts/${a.id}/file`;

  return (
    <tr className="border-b border-stone-200/70 hover:bg-stone-100/40 transition-colors">
      <td className="px-4 py-2.5">
        <span className="font-mono text-stone-800 break-all">{name}</span>
      </td>
      <td className="px-4 py-2.5 text-muted tabular-nums whitespace-nowrap">{fmtBytes(a.size_bytes)}</td>
      <td className="px-4 py-2.5 text-muted">
        <span className="text-stone-700">{a.stage_name || "—"}</span>
        <span className="text-stone-400 mx-1">·</span>
        <span className="font-mono text-[11px]">{a.step_name || "—"}</span>
      </td>
      <td className="px-4 py-2.5">
        <Link
          to={`/pipelines/${a.pipeline_id}`}
          className="text-stone-800 hover:text-accent line-clamp-2"
          title={a.pipeline_name}
        >
          {a.pipeline_name || a.pipeline_id.slice(0, 8)}
        </Link>
        {a.pipeline_repo_name ? (
          <div className="text-[10px] text-muted mt-0.5 truncate max-w-[14rem]">{a.pipeline_repo_name}</div>
        ) : null}
      </td>
      <td className="px-4 py-2.5">
        <Link to={`/runs/${a.run_id}`} className="font-mono text-accent hover:underline">
          {a.run_id.slice(0, 8)}
        </Link>
      </td>
      <td className="px-4 py-2.5">
        <StatusBadge status={a.run_status} />
      </td>
      <td className="px-4 py-2.5 text-muted whitespace-nowrap">{fmtTime(a.created_at)}</td>
      <td className="px-4 py-2.5 text-right">
        <a
          href={downloadHref}
          className="inline-flex items-center justify-center rounded-lg border border-stone-300/90 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-800 hover:border-indigo-400/60 hover:text-indigo-800 transition-colors"
          download
        >
          Download
        </a>
      </td>
    </tr>
  );
}

function fmtBytes(n: number): string {
  if (n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let x = n;
  while (x >= 1024 && i < u.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x < 10 && i > 0 ? x.toFixed(1) : Math.round(x)} ${u[i]}`;
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
