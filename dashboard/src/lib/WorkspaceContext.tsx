import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

const LS_KEY = "kyklos.selected_workspace_id";

type WorkspaceCtx = {
  workspaceId: string;
  setWorkspaceId: (id: string) => void;
};

const WorkspaceContext = createContext<WorkspaceCtx | null>(null);

function readStored(): string {
  try {
    return localStorage.getItem(LS_KEY) ?? "";
  } catch {
    return "";
  }
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaceId, setId] = useState(readStored);

  const setWorkspaceId = useCallback((id: string) => {
    setId(id);
    try {
      if (id) {
        localStorage.setItem(LS_KEY, id);
      } else {
        localStorage.removeItem(LS_KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ workspaceId, setWorkspaceId }),
    [workspaceId, setWorkspaceId]
  );

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspaceContext(): WorkspaceCtx {
  const x = useContext(WorkspaceContext);
  if (!x) {
    throw new Error("WorkspaceProvider is required");
  }
  return x;
}
