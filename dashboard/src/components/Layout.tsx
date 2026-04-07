import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useWorkspaceContext } from "../lib/WorkspaceContext";

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { workspaceId, setWorkspaceId } = useWorkspaceContext();
  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: api.workspaces.list,
  });

  return (
    <div className="min-h-screen flex flex-col bg-surface-0">
      <header className="sticky top-0 z-40 bg-[#fafaf8]/85 backdrop-blur-md border-b border-stone-200/80 px-4 md:px-8 py-3.5 flex items-center gap-6 shadow-[0_1px_0_rgba(41,37,36,0.06)] flex-wrap">
        <Link
          to="/"
          className="text-indigo-700 font-bold tracking-[0.2em] text-sm md:text-base hover:text-indigo-800 transition-colors duration-200"
        >
          ⟳ KYKLOS
        </Link>
        <div className="flex flex-1 items-center justify-between gap-4 min-w-0">
          <nav className="flex gap-1 text-xs flex-wrap" aria-label="Main">
            <Link
              to="/"
              className={`px-3 py-1.5 rounded-xl border-b-2 transition-all duration-200 ${
                pathname === "/"
                  ? "text-stone-900 border-indigo-600 bg-stone-200/50"
                  : "text-muted border-transparent hover:text-stone-900 hover:border-stone-300 hover:bg-stone-200/35"
              }`}
            >
              Pipelines
            </Link>
            <Link
              to="/runs"
              className={`px-3 py-1.5 rounded-xl border-b-2 transition-all duration-200 ${
                pathname === "/runs"
                  ? "text-stone-900 border-indigo-600 bg-stone-200/50"
                  : "text-muted border-transparent hover:text-stone-900 hover:border-stone-300 hover:bg-stone-200/35"
              }`}
            >
              All runs
            </Link>
            <Link
              to="/artifacts"
              className={`px-3 py-1.5 rounded-xl border-b-2 transition-all duration-200 ${
                pathname === "/artifacts"
                  ? "text-stone-900 border-indigo-600 bg-stone-200/50"
                  : "text-muted border-transparent hover:text-stone-900 hover:border-stone-300 hover:bg-stone-200/35"
              }`}
            >
              Artifacts
            </Link>
            <Link
              to="/catalog/steps"
              className={`px-3 py-1.5 rounded-xl border-b-2 transition-all duration-200 ${
                pathname === "/catalog/steps"
                  ? "text-stone-900 border-indigo-600 bg-stone-200/50"
                  : "text-muted border-transparent hover:text-stone-900 hover:border-stone-300 hover:bg-stone-200/35"
              }`}
            >
              Steps
            </Link>
            <Link
              to="/workspaces"
              className={`px-3 py-1.5 rounded-xl border-b-2 transition-all duration-200 ${
                pathname === "/workspaces"
                  ? "text-stone-900 border-indigo-600 bg-stone-200/50"
                  : "text-muted border-transparent hover:text-stone-900 hover:border-stone-300 hover:bg-stone-200/35"
              }`}
            >
              Workspaces
            </Link>
          </nav>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <label htmlFor="kyklos-ws-select" className="sr-only">
              Workspace
            </label>
            <select
              id="kyklos-ws-select"
              className="text-xs rounded-xl border border-stone-200 bg-white/90 px-2 py-1.5 max-w-[9rem] sm:max-w-[13rem] text-stone-800 shadow-sm"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              title="Pipelines are listed for this workspace"
            >
              <option value="">All workspaces</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          <Link
            to="/settings"
            className={`shrink-0 p-2 rounded-xl border border-transparent transition-colors ${
              pathname === "/settings"
                ? "text-indigo-700 bg-stone-200/50 border-stone-200/80"
                : "text-stone-500 hover:text-stone-800 hover:bg-stone-200/40"
            }`}
            aria-label="Settings"
            title="Settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8 pb-12" key={pathname}>
        <div className="animate-slide-up-fade">{children}</div>
      </main>
    </div>
  );
}
