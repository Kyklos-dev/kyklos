import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Spinner } from "../components/Spinner";
import { useWorkspaceContext } from "../lib/WorkspaceContext";

export function WorkspacesPage() {
  const qc = useQueryClient();
  const { setWorkspaceId } = useWorkspaceContext();

  const { data: list = [], isLoading } = useQuery({
    queryKey: ["workspaces"],
    queryFn: api.workspaces.list,
  });

  const [name, setName] = useState("");
  const [repoURL, setRepoURL] = useState("");
  const [formError, setFormError] = useState("");

  const createMut = useMutation({
    mutationFn: () => api.workspaces.create({ name: name.trim() || undefined, repo_url: repoURL.trim() }),
    onSuccess: (w) => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      setName("");
      setRepoURL("");
      setFormError("");
      setWorkspaceId(w.id);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.workspaces.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
    onError: (e: Error) => setFormError(e.message),
  });

  const scanMut = useMutation({
    mutationFn: (id: string) => api.workspaces.scanBranches(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="ky-breadcrumb text-xs text-muted mb-5">
        <Link to="/">Pipelines</Link>
        <span className="text-surface-3"> / </span>
        <span className="text-gray-900 font-medium">Workspaces</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1">Workspaces</h1>
      <p className="text-xs text-muted mb-8 max-w-xl leading-relaxed">
        Each workspace is one public Git clone URL. Pipelines belong to a workspace; runs check out the branch you pick.
        Branch names are cached from <code className="text-gray-600">git ls-remote</code> on the Kyklos server (needs{" "}
        <code className="text-gray-600">git</code> installed).
      </p>

      <div className="ky-card p-5 md:p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">New workspace</h2>
        <label className="block text-xs text-muted mb-1">Display name (optional)</label>
        <input
          className="ky-input mb-3"
          placeholder="My monorepo"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="block text-xs text-muted mb-1">Public Git URL (https)</label>
        <input
          className="ky-input mb-3 font-mono text-sm"
          placeholder="https://github.com/org/repo.git"
          value={repoURL}
          onChange={(e) => setRepoURL(e.target.value)}
        />
        {formError && (
          <p className="text-danger text-xs mb-3 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20">
            {formError}
          </p>
        )}
        <button
          type="button"
          className="ky-btn-primary"
          disabled={createMut.isPending || !repoURL.trim()}
          onClick={() => {
            setFormError("");
            createMut.mutate();
          }}
        >
          {createMut.isPending ? "Creating…" : "Add workspace"}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <div className="ky-card text-center py-12 text-sm text-muted">No workspaces yet. Add a repo URL above.</div>
      ) : (
        <ul className="space-y-3">
          {list.map((w) => (
            <li key={w.id} className="ky-card p-4 flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
              <div className="min-w-0">
                <div className="font-semibold text-gray-900">{w.name}</div>
                <code className="text-[11px] text-accent break-all leading-snug block mt-1">{w.repo_url}</code>
                <div className="text-[11px] text-muted mt-2">
                  Default branch: <code className="text-gray-700">{w.default_branch}</code>
                  {" · "}
                  {w.branches?.length ?? 0} branch{(w.branches?.length ?? 0) !== 1 ? "es" : ""} cached
                  {w.branches_updated_at && (
                    <>
                      {" "}
                      · updated {new Date(w.branches_updated_at).toLocaleString()}
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  className="ky-btn-secondary text-[11px] py-1.5"
                  onClick={() => setWorkspaceId(w.id)}
                >
                  Use for pipelines
                </button>
                <button
                  type="button"
                  className="ky-btn-secondary text-[11px] py-1.5"
                  disabled={scanMut.isPending && scanMut.variables === w.id}
                  onClick={() => scanMut.mutate(w.id)}
                >
                  {scanMut.isPending && scanMut.variables === w.id ? "…" : "Scan branches"}
                </button>
                <button
                  type="button"
                  className="text-[11px] px-3 py-1.5 rounded-lg border border-danger/40 text-danger hover:bg-danger/10"
                  disabled={deleteMut.isPending}
                  onClick={() => {
                    if (confirm(`Delete workspace “${w.name}”? (Only if it has no pipelines.)`)) {
                      deleteMut.mutate(w.id);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
