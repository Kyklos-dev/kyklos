import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Spinner } from "../components/Spinner";

type Row = { id: string; key: string; value: string };

let rowId = 0;
function nextId() {
  rowId += 1;
  return `r${rowId}`;
}

function envToRows(env: Record<string, string>): Row[] {
  const entries = Object.entries(env);
  if (entries.length === 0) {
    return [{ id: nextId(), key: "", value: "" }];
  }
  return entries.map(([key, value]) => ({ id: nextId(), key, value }));
}

export function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["settings", "env"],
    queryFn: api.settings.getEnv,
  });

  const [rows, setRows] = useState<Row[]>([{ id: nextId(), key: "", value: "" }]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (data?.env) {
      setRows(envToRows(data.env));
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: (env: Record<string, string>) => api.settings.setEnv(env),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "env"] });
      setSaveMsg("Saved.");
      setTimeout(() => setSaveMsg(null), 2500);
    },
    onError: (e: Error) => setSaveMsg(`Error: ${e.message}`),
  });

  const updateRow = useCallback((id: string, field: "key" | "value", v: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: v } : r)));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { id: nextId(), key: "", value: "" }]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length ? next : [{ id: nextId(), key: "", value: "" }];
    });
  }, []);

  const onSave = () => {
    const env: Record<string, string> = {};
    for (const r of rows) {
      const k = r.key.trim();
      if (k === "") continue;
      env[k] = r.value;
    }
    saveMut.mutate(env);
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto flex justify-center py-24">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto text-red-700 text-sm">
        Failed to load settings: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold text-stone-900 tracking-tight mb-1">Settings</h1>
      <p className="text-sm text-muted mb-6">
        Global environment variables are merged into every pipeline run. Keys defined in{" "}
        <code className="text-xs bg-stone-200/80 px-1 rounded">kyklos.yaml</code> override the same
        key here. Values are stored in the server database — the dashboard has no authentication; use
        only on trusted networks.
      </p>

      <div className="rounded-2xl border border-stone-200/90 bg-white shadow-sm p-5 md:p-6">
        <h2 className="text-sm font-semibold text-stone-800 mb-4">Global environment</h2>
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <input
                type="text"
                placeholder="NAME"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 min-w-0 rounded-xl border border-stone-200 px-3 py-2 text-sm font-mono"
                value={r.key}
                onChange={(e) => updateRow(r.id, "key", e.target.value)}
              />
              <input
                type="text"
                placeholder="value"
                autoComplete="off"
                spellCheck={false}
                className="flex-[2] min-w-0 rounded-xl border border-stone-200 px-3 py-2 text-sm font-mono"
                value={r.value}
                onChange={(e) => updateRow(r.id, "value", e.target.value)}
              />
              <button
                type="button"
                className="shrink-0 rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-600 hover:bg-stone-50"
                onClick={() => removeRow(r.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-xl border border-stone-300 bg-stone-50 px-4 py-2 text-sm hover:bg-stone-100"
            onClick={addRow}
          >
            Add variable
          </button>
          <button
            type="button"
            className="rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            onClick={onSave}
            disabled={saveMut.isPending}
          >
            {saveMut.isPending ? "Saving…" : "Save"}
          </button>
          {saveMsg ? <span className="text-sm text-stone-600">{saveMsg}</span> : null}
        </div>
      </div>
    </div>
  );
}
