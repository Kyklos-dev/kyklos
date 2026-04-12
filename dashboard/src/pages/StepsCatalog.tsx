import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { StepMeta } from "../lib/types";
import { Spinner } from "../components/Spinner";
import {
  formatStepYamlExample,
  fsPathToKyklosUses,
  getCatalogMetaForPath,
} from "../lib/stepCatalogExamples";
import { docsUrl } from "../lib/docsBase";

export function StepsCatalogPage() {
  const [q, setQ] = useState("");
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [hoverPath, setHoverPath] = useState<string | null>(null);

  const { data: steps = [], isLoading, isError, error } = useQuery({
    queryKey: ["catalog", "steps"],
    queryFn: api.catalog.steps,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return steps;
    return steps.filter(
      (s) =>
        s.path.toLowerCase().includes(t) ||
        s.category.toLowerCase().includes(t) ||
        s.name.toLowerCase().includes(t) ||
        s.description.toLowerCase().includes(t)
    );
  }, [steps, q]);

  const byCat = useMemo(() => {
    const m = new Map<string, StepMeta[]>();
    for (const s of filtered) {
      const c = s.category || "other";
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(s);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  function showPanel(path: string): boolean {
    return openPath === path || hoverPath === path;
  }

  async function copyYaml(path: string) {
    const uses = fsPathToKyklosUses(path);
    const meta = getCatalogMetaForPath(path);
    const text = formatStepYamlExample(meta, uses);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="ky-breadcrumb text-xs text-muted mb-5 flex items-center flex-wrap gap-x-2 gap-y-1">
        <Link to="/">Pipelines</Link>
        <span className="text-surface-3">/</span>
        <span className="text-gray-900 font-medium">Step catalog</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Built-in steps</h1>
      <p className="text-xs text-muted mb-4 max-w-2xl leading-relaxed">
        Python scripts under the server <code className="text-gray-500">steps/</code> directory. Reference them in
        kyklos.yaml as <code className="text-gray-500">kyklos/&lt;name&gt;</code>. Full prose documentation lives on the
        docs site:{" "}
        <a
          href={docsUrl("/reference/steps/")}
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          Built-in steps
        </a>
        . Hover a card for the YAML example; click Pin to keep it open; Copy copies to the clipboard.
      </p>

      <input
        className="ky-input py-2 text-xs w-full max-w-md mb-6"
        placeholder="Filter by path, category, name…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {isLoading ? (
        <div className="flex items-center gap-3 text-muted py-16">
          <Spinner className="text-accent w-7 h-7" />
          Loading catalog…
        </div>
      ) : isError ? (
        <p className="text-sm text-danger">{error instanceof Error ? error.message : String(error)}</p>
      ) : steps.length === 0 ? (
        <p className="text-sm text-muted">
          No steps found. Set <code className="text-gray-500">KYKLOS_STEPS_DIR</code> on the server or run from the
          repo root so <code className="text-gray-500">steps/</code> is visible.
        </p>
      ) : (
        <div className="space-y-8">
          {byCat.map(([cat, items]) => (
            <section key={cat}>
              <h2 className="text-sm font-bold text-gray-900 mb-3 capitalize">{cat}</h2>
              <div className="grid gap-2">
                {items.map((s) => {
                  const uses = fsPathToKyklosUses(s.path);
                  const meta = getCatalogMetaForPath(s.path);
                  const yamlText = formatStepYamlExample(meta, uses);
                  const expanded = showPanel(s.path);

                  return (
                    <div
                      key={s.path}
                      className={`rounded-lg border bg-surface-1/40 px-4 py-3 text-xs transition-colors ${
                        expanded ? "border-accent/50 ring-1 ring-accent/20" : "border-surface-3/60 hover:border-accent/30"
                      }`}
                      onMouseEnter={() => setHoverPath(s.path)}
                      onMouseLeave={() => setHoverPath((h) => (h === s.path ? null : h))}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-accent mb-1 select-all">{uses}</div>
                          <div className="text-[10px] text-muted mb-1">{s.path}</div>
                          {s.description && <p className="text-muted leading-relaxed mb-2">{s.description}</p>}
                          {meta?.withHint && (
                            <p className="text-[10px] text-gray-500 leading-relaxed mb-2 border-l-2 border-surface-3 pl-2">
                              {meta.withHint}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-2 flex-wrap justify-end">
                          {meta?.docPath && (
                            <a
                              href={docsUrl(meta.docPath)}
                              target="_blank"
                              rel="noreferrer"
                              className="ky-btn-secondary text-[10px] py-1 px-2 inline-flex items-center"
                            >
                              Docs
                            </a>
                          )}
                          <button
                            type="button"
                            className="ky-btn-secondary text-[10px] py-1 px-2"
                            onClick={() => {
                              void copyYaml(s.path);
                            }}
                          >
                            Copy YAML
                          </button>
                          <button
                            type="button"
                            className={`text-[10px] py-1 px-2 rounded border ${
                              openPath === s.path
                                ? "border-accent bg-accent/10 text-accent"
                                : "border-surface-3 text-muted hover:border-accent/40"
                            }`}
                            onClick={() => setOpenPath((p) => (p === s.path ? null : s.path))}
                          >
                            {openPath === s.path ? "Unpin" : "Pin"}
                          </button>
                        </div>
                      </div>
                      <div className="text-[10px] text-muted mt-1">{(s.size_bytes / 1024).toFixed(1)} KB</div>

                      <div
                        className={`mt-3 overflow-hidden transition-all duration-200 ${
                          expanded ? "max-h-[min(70vh,520px)] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                        }`}
                      >
                        <div className="rounded-md border border-surface-3/80 bg-slate-950/90 p-3 text-left shadow-inner">
                          <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">
                            Example (under <code className="text-slate-300">steps:</code>)
                          </p>
                          <pre className="text-[10px] leading-relaxed text-emerald-100/95 whitespace-pre-wrap break-words font-mono overflow-x-auto max-h-[min(60vh,460px)] overflow-y-auto">
                            {yamlText}
                          </pre>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
