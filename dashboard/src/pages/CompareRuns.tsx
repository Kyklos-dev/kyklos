import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { RunCompareResponse } from "../lib/types";

function exportCompareCsv(data: RunCompareResponse): void {
  const rows = Object.entries(data.score_diff).sort(([x], [y]) => x.localeCompare(y));
  const lines = ["metric,a,b,delta_b_minus_a"];
  for (const [k, v] of rows) {
    const cell = k.split('"').join('""');
    lines.push(`"${cell}",${v.a},${v.b},${v.delta}`);
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `compare-${data.run_a.id.slice(0, 8)}-${data.run_b.id.slice(0, 8)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCompareJson(data: RunCompareResponse): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `compare-${data.run_a.id.slice(0, 8)}-${data.run_b.id.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
import { Spinner } from "../components/Spinner";

export function CompareRunsPage() {
  const { id: pipelineId } = useParams<{ id: string }>();
  const [sp, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [runA, setRunA] = useState(sp.get("a")?.trim() ?? "");
  const [runB, setRunB] = useState(sp.get("b")?.trim() ?? "");

  const { data: runs = [] } = useQuery({
    queryKey: ["runs", pipelineId, "compare-picker"],
    queryFn: () => api.pipelines.listRuns(pipelineId!),
    enabled: !!pipelineId,
    refetchInterval: 10_000,
  });

  const { data: pipeline } = useQuery({
    queryKey: ["pipeline", pipelineId],
    queryFn: () => api.pipelines.get(pipelineId!),
    enabled: !!pipelineId,
  });

  const runsSorted = useMemo(() => {
    return [...runs].sort(
      (x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime()
    );
  }, [runs]);

  /** B cannot be the same run as A */
  const runsForB = useMemo(
    () => runsSorted.filter((r) => !runA || r.id !== runA),
    [runsSorted, runA]
  );

  /** A cannot be the same run as B */
  const runsForA = useMemo(
    () => runsSorted.filter((r) => !runB || r.id !== runB),
    [runsSorted, runB]
  );

  useEffect(() => {
    setRunA(sp.get("a")?.trim() ?? "");
    setRunB(sp.get("b")?.trim() ?? "");
  }, [sp]);

  /** Keep the address bar in sync: when a baseline is set on the pipeline, put `?a=<run>` in the URL (Run A). */
  useEffect(() => {
    if (!pipelineId || !pipeline?.baseline_run_id) return;
    const aParam = sp.get("a")?.trim();
    if (aParam) return;
    const next = new URLSearchParams(sp);
    next.set("a", pipeline.baseline_run_id);
    setSearchParams(next, { replace: true });
  }, [pipelineId, pipeline?.baseline_run_id, sp, setSearchParams]);

  /** When the URL has no `a=`, default Run A from the labeled pipeline baseline (if any). You can still pick another run for A. */
  useEffect(() => {
    const aParam = sp.get("a")?.trim();
    if (aParam) return;
    if (!pipeline?.baseline_run_id) return;
    setRunA((prev) => (prev.trim() ? prev : pipeline.baseline_run_id!));
  }, [sp, pipeline?.baseline_run_id]);

  /** When the URL has no `b=`, default Run B to the newest run that is not the reference (A). */
  useEffect(() => {
    const bParam = sp.get("b")?.trim();
    if (bParam) return;
    if (!runsSorted.length) return;
    const ref =
      (sp.get("a")?.trim() || runA.trim() || pipeline?.baseline_run_id || "").trim();
    const pick = runsSorted.find((r) => r.id !== ref);
    if (!pick) return;
    setRunB((prev) => (prev.trim() ? prev : pick.id));
  }, [sp, runsSorted, runA, pipeline?.baseline_run_id]);

  useEffect(() => {
    if (runA && runB && runA === runB) {
      setRunB("");
    }
  }, [runA, runB]);

  const aUrl = sp.get("a")?.trim() ?? "";
  const bUrl = sp.get("b")?.trim() ?? "";
  /** URL wins when present; otherwise use form state (defaults). */
  const aResolved = (aUrl || runA).trim();
  const bResolved = (bUrl || runB).trim();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["compare", aResolved, bResolved],
    queryFn: () => api.runs.compare(aResolved, bResolved),
    enabled: !!aResolved && !!bResolved && aResolved !== bResolved,
  });

  const apply = () => {
    if (!pipelineId) return;
    const q = new URLSearchParams();
    if (runA) q.set("a", runA);
    if (runB) q.set("b", runB);
    navigate(`/pipelines/${pipelineId}/compare?${q.toString()}`);
  };

  if (!pipelineId) {
    return (
      <div className="max-w-6xl mx-auto text-danger text-sm">Missing pipeline id.</div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="ky-breadcrumb text-xs text-muted mb-5 flex items-center flex-wrap gap-x-2 gap-y-1">
        <Link to="/">Pipelines</Link>
        <span className="text-surface-3">/</span>
        <Link to={`/pipelines/${pipelineId}`}>{pipelineId.slice(0, 8)}</Link>
        <span className="text-surface-3">/</span>
        <span className="text-gray-900 font-medium">compare runs</span>
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-4">Compare runs</h1>
      <p className="text-xs text-muted mb-4 max-w-xl leading-relaxed">
        <strong className="text-gray-600">Run A</strong> is the reference side (defaults to the labeled baseline from
        the pipeline Run History when you open this page without <code className="text-gray-500">?a=</code> — you can
        pick any other run). <strong className="text-gray-600">Run B</strong> is what you compare against it
        (defaults to the newest run that is not A). Δ is B−A. Scores, Git SHAs, and eval bundle fingerprints are
        included.
      </p>

      <div className="flex flex-col lg:flex-row gap-3 mb-6 items-end">
        <label className="flex flex-col gap-1 text-xs flex-1 min-w-0">
          <span className="text-muted">
            Run A (reference)
            {pipeline?.baseline_run_id && runA === pipeline.baseline_run_id && (
              <span className="text-amber-800"> — labeled baseline</span>
            )}
          </span>
          {runs.length > 0 ? (
            <select
              value={
                runA && (runsForA.some((r) => r.id === runA) || !runs.some((r) => r.id === runA))
                  ? runA
                  : ""
              }
              onChange={(e) => setRunA(e.target.value)}
              className="ky-input font-mono text-xs"
            >
              <option value="">Select a run…</option>
              {runA && !runs.some((r) => r.id === runA) && runA !== runB && (
                <option value={runA}>{runA.slice(0, 8)}… (current — not in list)</option>
              )}
              {runsForA.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id.slice(0, 8)} — {r.status} — {fmtRunWhen(r.created_at)}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-[11px] text-muted py-2">No runs in this pipeline yet.</p>
          )}
          <input
            value={runA}
            onChange={(e) => setRunA(e.target.value)}
            className="ky-input font-mono text-xs"
            placeholder="Or type / paste full UUID for A"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs flex-1 min-w-0">
          <span className="text-muted">Run B (compare against A)</span>
          {runs.length > 0 ? (
            <select
              value={
                runB && (runsForB.some((r) => r.id === runB) || !runs.some((r) => r.id === runB))
                  ? runB
                  : ""
              }
              onChange={(e) => setRunB(e.target.value)}
              className="ky-input font-mono text-xs"
            >
              <option value="">Select a run…</option>
              {runB && !runs.some((r) => r.id === runB) && runB !== runA && (
                <option value={runB}>{runB.slice(0, 8)}… (current — not in list)</option>
              )}
              {runsForB.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id.slice(0, 8)} — {r.status} — {fmtRunWhen(r.created_at)}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-[11px] text-muted py-2">No runs in this pipeline yet.</p>
          )}
          <input
            value={runB}
            onChange={(e) => setRunB(e.target.value)}
            className="ky-input font-mono text-xs"
            placeholder="Or type / paste full UUID for B"
          />
        </label>
        <button type="button" onClick={apply} className="ky-btn-primary shrink-0">
          Compare
        </button>
      </div>

      {!aResolved || !bResolved || aResolved === bResolved ? (
        <p className="text-xs text-muted">
          {aResolved === bResolved && aResolved
            ? "Pick two different runs (A and B)."
            : "Choose both runs, or rely on defaults once you have labeled a baseline and at least one other run."}
        </p>
      ) : isLoading ? (
        <div className="flex items-center gap-3 text-muted text-sm py-8">
          <Spinner className="text-accent w-6 h-6" />
          Loading comparison…
        </div>
      ) : isError ? (
        <p className="text-sm text-danger">
          {error instanceof Error ? error.message : String(error)}
        </p>
      ) : data ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportCompareCsv(data)}
              className="ky-btn-secondary text-[11px] py-1.5 px-3"
            >
              Export compare CSV
            </button>
            <button
              type="button"
              onClick={() => exportCompareJson(data)}
              className="ky-btn-secondary text-[11px] py-1.5 px-3"
            >
              Export compare JSON
            </button>
          </div>
          <CompareTable data={data} />
        </div>
      ) : null}
    </div>
  );
}

function fmtRunWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function CompareTable({ data }: { data: RunCompareResponse }) {
  const meta = data.meta;
  const rows = Object.entries(data.score_diff).sort(([x], [y]) => x.localeCompare(y));

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="rounded-xl border border-surface-2 bg-surface-1/40 p-4 text-xs">
        <h2 className="text-muted font-semibold uppercase tracking-wide mb-2">Git &amp; eval bundle</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-gray-800">
          <div>
            <span className="text-muted">SHA A:</span>{" "}
            <code className="text-accent">{meta.git_sha.a || "—"}</code>
          </div>
          <div>
            <span className="text-muted">SHA B:</span>{" "}
            <code className="text-accent">{meta.git_sha.b || "—"}</code>
          </div>
          <div className="sm:col-span-2 break-all">
            <span className="text-muted">Fingerprint A:</span>{" "}
            <span className="font-mono text-gray-700">{meta.eval_bundle_fingerprint.a || "—"}</span>
          </div>
          <div className="sm:col-span-2 break-all">
            <span className="text-muted">Fingerprint B:</span>{" "}
            <span className="font-mono text-gray-700">{meta.eval_bundle_fingerprint.b || "—"}</span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-bold text-gray-900 mb-2">Score diff (flattened)</h2>
        <div className="overflow-x-auto rounded-xl border border-surface-2">
          <table className="w-full text-xs text-left">
            <thead className="bg-surface-2/80 text-muted uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 font-semibold">Metric</th>
                <th className="px-3 py-2 font-semibold">A</th>
                <th className="px-3 py-2 font-semibold">B</th>
                <th className="px-3 py-2 font-semibold">Δ (B−A)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k} className="border-t border-surface-2/60">
                  <td className="px-3 py-2 font-mono text-gray-800 break-all">{k}</td>
                  <td className="px-3 py-2 text-gray-700">{v.a.toFixed(4)}</td>
                  <td className="px-3 py-2 text-gray-700">{v.b.toFixed(4)}</td>
                  <td
                    className={`px-3 py-2 font-medium ${
                      v.delta > 0 ? "text-emerald-700" : v.delta < 0 ? "text-amber-700" : "text-muted"
                    }`}
                  >
                    {v.delta > 0 ? "+" : ""}
                    {v.delta.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
