import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { StepMeta } from "../lib/types";
import { Spinner } from "../components/Spinner";

export function StepsCatalogPage() {
  const [q, setQ] = useState("");
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
        kyklos.yaml as <code className="text-gray-500">kyklos/&lt;category&gt;/&lt;name&gt;</code> (see repo docs).
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
                {items.map((s) => (
                  <div
                    key={s.path}
                    className="rounded-lg border border-surface-3/60 bg-surface-1/40 px-4 py-3 text-xs"
                  >
                    <div className="font-mono text-accent mb-1 select-all">{s.path}</div>
                    {s.description && (
                      <p className="text-muted leading-relaxed mb-2">{s.description}</p>
                    )}
                    <div className="text-[10px] text-muted">
                      {(s.size_bytes / 1024).toFixed(1)} KB
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
