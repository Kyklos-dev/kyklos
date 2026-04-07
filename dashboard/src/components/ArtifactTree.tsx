import type { RunArtifact } from "../lib/types";

/** Group persisted artifacts by stage → step for an in-tree browser. */
export function ArtifactTree({
  runId,
  artifacts,
}: {
  runId: string;
  artifacts: RunArtifact[];
}) {
  const byStage = new Map<string, Map<string, RunArtifact[]>>();
  for (const a of artifacts) {
    const st = a.stage_name || "(stage)";
    const sp = a.step_name || "(step)";
    if (!byStage.has(st)) byStage.set(st, new Map());
    const m = byStage.get(st)!;
    if (!m.has(sp)) m.set(sp, []);
    m.get(sp)!.push(a);
  }

  const stages = [...byStage.keys()].sort();

  return (
    <div className="text-xs text-gray-800 space-y-3">
      {stages.map((stage) => (
        <div key={stage} className="border border-surface-3/50 rounded-lg overflow-hidden bg-surface-0/30">
          <div className="px-3 py-2 bg-surface-2/50 text-muted font-semibold uppercase tracking-wide text-[10px]">
            {stage}
          </div>
          <div className="divide-y divide-surface-3/40">
            {[...byStage.get(stage)!.entries()].map(([step, items]) => (
              <div key={step} className="px-3 py-2">
                <div className="text-[11px] text-accent/90 font-medium mb-1.5">{step}</div>
                <ul className="space-y-1 pl-2 border-l border-surface-3/60">
                  {items.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-muted">└</span>
                      <a
                        href={`/api/v1/runs/${runId}/artifacts/${a.id}/file`}
                        className="font-mono text-accent hover:underline break-all"
                        download
                      >
                        {a.logical_name}
                      </a>
                      <span className="text-muted shrink-0">({fmtBytes(a.size_bytes)})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
