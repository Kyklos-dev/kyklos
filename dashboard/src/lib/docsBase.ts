/**
 * Base URL for the VitePress documentation site (opens in a new tab from the dashboard).
 * Override at build time: `VITE_KYKLOS_DOCS_BASE=https://your-docs.example.com npm run build`
 */
export const KYKLOS_DOCS_BASE = (import.meta.env.VITE_KYKLOS_DOCS_BASE as string | undefined)?.replace(/\/$/, "") ?? "";

/**
 * Absolute documentation URL for a path like `/reference/steps/evaluate#step-llm-judge`.
 * When `KYKLOS_DOCS_BASE` is empty, falls back to the repo’s default public docs URL.
 */
const DEFAULT_PUBLIC_DOCS = "https://kyklos-mroa2pbl8-kyklos-devs-projects.vercel.app";

export function docsUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = KYKLOS_DOCS_BASE || DEFAULT_PUBLIC_DOCS;
  return `${base.replace(/\/$/, "")}${p}`;
}
