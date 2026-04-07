import type {
  ArtifactListItem,
  Pipeline,
  Run,
  RunDetail,
  LogLine,
  RunCompareResponse,
  RunSummary,
  StepMeta,
  Workspace,
} from "./types";

const BASE = "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204 || res.headers.get("Content-Length") === "0") {
    return undefined as T;
  }
  const text = await res.text();
  if (!text.trim()) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export const api = {
  workspaces: {
    list: () => request<Workspace[]>("/workspaces"),
    get: (id: string) => request<Workspace>(`/workspaces/${id}`),
    create: (body: { name?: string; repo_url: string }) =>
      request<Workspace>("/workspaces", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<void>(`/workspaces/${id}`, { method: "DELETE" }),
    scanBranches: (id: string) =>
      request<Workspace>(`/workspaces/${id}/scan-branches`, { method: "POST" }),
    getFile: (id: string, opts?: { branch?: string; path?: string }) => {
      const q = new URLSearchParams();
      if (opts?.branch?.trim()) q.set("branch", opts.branch.trim());
      if (opts?.path?.trim()) q.set("path", opts.path.trim());
      const suffix = q.toString() ? `?${q}` : "";
      return request<{ content: string; branch: string; path: string }>(
        `/workspaces/${id}/file${suffix}`
      );
    },
  },

  pipelines: {
    list: (opts?: { workspace_id?: string }) => {
      const q = opts?.workspace_id
        ? `?workspace_id=${encodeURIComponent(opts.workspace_id)}`
        : "";
      return request<Pipeline[]>(`/pipelines${q}`);
    },
    get: (id: string) => request<Pipeline>(`/pipelines/${id}`),
    create: (
      yaml: string,
      opts?: { repo_name?: string; workspace_id?: string }
    ) =>
      request<Pipeline>("/pipelines", {
        method: "POST",
        body: JSON.stringify({
          yaml,
          repo_name: opts?.repo_name ?? "",
          workspace_id: opts?.workspace_id?.trim() ?? "",
        }),
      }),
    update: (id: string, payload: { yaml?: string; workspace_id?: string }) =>
      request<Pipeline>(`/pipelines/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    delete: (id: string) =>
      request<void>(`/pipelines/${id}`, { method: "DELETE" }),
    triggerRun: (
      id: string,
      opts?: { sha?: string; branch?: string; workspace_path?: string }
    ) =>
      request<{ status: string; pipeline_id: string }>(`/pipelines/${id}/runs`, {
        method: "POST",
        body: JSON.stringify(opts ?? {}),
      }),
    listRuns: (id: string, opts?: { enrich?: boolean }) => {
      const q = opts?.enrich ? "?enrich=1" : "";
      return request<Run[]>(`/pipelines/${id}/runs${q}`);
    },
    setBaseline: (pipelineId: string, runId: string) =>
      request<Pipeline>(`/pipelines/${pipelineId}/baseline`, {
        method: "PUT",
        body: JSON.stringify({ run_id: runId }),
      }),
    clearBaseline: (pipelineId: string) =>
      request<Pipeline>(`/pipelines/${pipelineId}/baseline`, {
        method: "DELETE",
      }),
  },

  runs: {
    listAll: (opts?: { status?: string; repo?: string; branch?: string; limit?: number }) => {
      const q = new URLSearchParams();
      if (opts?.status) q.set("status", opts.status);
      if (opts?.repo) q.set("repo", opts.repo);
      if (opts?.branch) q.set("branch", opts.branch);
      if (opts?.limit) q.set("limit", String(opts.limit));
      const suffix = q.toString() ? `?${q}` : "";
      return request<RunSummary[]>(`/runs${suffix}`);
    },
    get: (id: string) => request<RunDetail>(`/runs/${id}`),
    compare: (a: string, b: string) =>
      request<RunCompareResponse>(
        `/runs/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`
      ),
    cancel: (id: string) =>
      request<{ status: string; run_id: string }>(`/runs/${id}/cancel`, { method: "POST" }),
    rerun: (id: string) =>
      request<{ status: string; pipeline_id: string }>(`/runs/${id}/rerun`, {
        method: "POST",
      }),
  },

  catalog: {
    steps: () => request<StepMeta[]>("/catalog/steps"),
  },

  artifacts: {
    list: (opts?: { q?: string; pipeline?: string; limit?: number }) => {
      const q = new URLSearchParams();
      if (opts?.q?.trim()) q.set("q", opts.q.trim());
      if (opts?.pipeline?.trim()) q.set("pipeline", opts.pipeline.trim());
      if (opts?.limit) q.set("limit", String(opts.limit));
      const suffix = q.toString() ? `?${q}` : "";
      return request<ArtifactListItem[]>(`/artifacts${suffix}`);
    },
  },

  settings: {
    getEnv: () => request<{ env: Record<string, string> }>("/settings/env"),
    setEnv: (env: Record<string, string>) =>
      request<{ env: Record<string, string> }>("/settings/env", {
        method: "PUT",
        body: JSON.stringify({ env }),
      }),
  },
};

export type StreamLogsOptions = {
  reconnectWhile?: () => boolean;
  reconnectDelayMs?: number;
};

export function streamLogs(
  runId: string,
  onLine: (line: LogLine) => void,
  onDone: () => void,
  options?: StreamLogsOptions
): () => void {
  let closed = false;
  let finished = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let es: EventSource | null = null;

  const detach = () => {
    if (!es) return;
    es.onerror = null;
    es.onmessage = null;
    es.close();
    es = null;
  };

  const connect = () => {
    if (closed || finished) return;
    detach();

    es = new EventSource(`${BASE}/runs/${runId}/logs`);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as LogLine;
        onLine(data);
      } catch {
        /* ignore parse errors */
      }
    };

    es.addEventListener("done", () => {
      finished = true;
      detach();
      if (!closed) {
        onDone();
      }
    });

    es.onerror = () => {
      detach();
      if (closed || finished) return;
      const shouldReconnect = options?.reconnectWhile?.() ?? false;
      if (shouldReconnect) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, options?.reconnectDelayMs ?? 1200);
      } else {
        finished = true;
        onDone();
      }
    };
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    detach();
  };
}
