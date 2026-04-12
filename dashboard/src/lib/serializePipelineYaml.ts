import { parse as parseYaml } from "yaml";
import type { BuilderStep, PipelineModel } from "./pipelineModel";
import type { PredefinedStep } from "./predefinedSteps";

/** Minimal YAML for one step as it appears under a stage’s `steps:` list. */
export function formatStepExampleForKyklosYaml(meta: PredefinedStep): string {
  const lines: string[] = [];
  lines.push(`- uses: ${meta.uses}`);
  const w = meta.defaultWith;
  if (w && typeof w === "object" && !Array.isArray(w) && Object.keys(w).length > 0) {
    lines.push(`  with:`);
    for (const k of Object.keys(w)) {
      lines.push(`    ${k}: ${yamlScalar(w[k])}`);
    }
  }
  return lines.join("\n");
}

/**
 * Exact `kyklos.yaml` lines for one step (same indentation as under `pipeline:` → `steps:`).
 */
export function serializeStepBlockForPipelineYaml(step: BuilderStep): string {
  const lines: string[] = [];
  lines.push(`      - uses: ${step.uses}`);
  lines.push(...indentWithBlock(step.with));
  return lines.join("\n");
}

function dedentYamlBlock(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let min = Infinity;
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = /^(\s*)/.exec(line);
    if (m) min = Math.min(min, m[1].length);
  }
  if (!Number.isFinite(min) || min === Infinity) return text.trim();
  return lines
    .map((l) => (l.trim() ? l.slice(min) : ""))
    .join("\n")
    .trim();
}

/**
 * Parse a step fragment the user edited (dedented `- uses:` … optional `with:`).
 */
export function parseStepBlockFromPipelineYaml(
  source: string
): { ok: true; uses: string; with: Record<string, unknown> } | { ok: false; error: string } {
  const body = dedentYamlBlock(source);
  if (!body) return { ok: false, error: "Empty" };
  if (!/^\-\s*uses\s*:/m.test(body)) {
    return { ok: false, error: 'Expected a line starting with "- uses: …"' };
  }
  const indented = body
    .split("\n")
    .map((line) => (line ? `  ${line}` : ""))
    .join("\n");
  const wrapped = `steps:\n${indented}\n`;
  try {
    const doc = parseYaml(wrapped) as { steps?: unknown };
    const arr = doc?.steps;
    if (!Array.isArray(arr) || arr.length === 0) {
      return { ok: false, error: "Could not parse step list" };
    }
    const first = arr[0];
    if (first === null || typeof first !== "object" || Array.isArray(first)) {
      return { ok: false, error: "Invalid step" };
    }
    const o = first as Record<string, unknown>;
    const uses = o.uses;
    if (typeof uses !== "string" || !uses.trim()) {
      return { ok: false, error: "`uses` must be a non-empty string" };
    }
    const withRaw = o.with;
    let withObj: Record<string, unknown> = {};
    if (withRaw !== undefined) {
      if (withRaw === null || typeof withRaw !== "object" || Array.isArray(withRaw)) {
        return { ok: false, error: "`with` must be a mapping (object)" };
      }
      withObj = { ...(withRaw as Record<string, unknown>) };
    }
    return { ok: true, uses: uses.trim(), with: withObj };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid YAML";
    return { ok: false, error: msg };
  }
}

/** Escape a value for a single-line YAML value */
function yamlScalar(v: unknown): string {
  if (v === null || v === undefined) return '""';
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : '""';
  if (typeof v === "string") {
    if (
      v === "" ||
      /[#:[\]{}&*!|>'"%@`,]/.test(v) ||
      v.includes("\n") ||
      /^\s/.test(v) ||
      /\s$/.test(v)
    ) {
      return JSON.stringify(v);
    }
    return v;
  }
  return JSON.stringify(v);
}

function nameLine(s: string): string {
  if (/^[a-zA-Z0-9_-]+$/.test(s) && !/^\d/.test(s)) return s;
  return yamlScalar(s);
}

function indentWithBlock(withObj: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const keys = Object.keys(withObj);
  if (keys.length === 0) return lines;
  lines.push("        with:");
  for (const k of keys) {
    lines.push(`          ${k}: ${yamlScalar(withObj[k])}`);
  }
  return lines;
}

/** Build kyklos.yaml text from the visual builder model */
export function serializePipelineToYaml(model: PipelineModel): string {
  const parts: string[] = [];
  parts.push(`version: "1.0"`);
  parts.push(`name: ${nameLine(model.pipelineName)}`);

  parts.push(`agent:`);
  parts.push(`  model: ${yamlScalar(model.agentModel)}`);
  if (model.agentPrompt.trim()) {
    parts.push(`  prompt: ${yamlScalar(model.agentPrompt)}`);
  }
  parts.push(`  runner:`);
  parts.push(`    type: anthropic`);
  parts.push(`triggers:`);
  parts.push(`  - on: manual`);
  parts.push(`pipeline:`);

  for (const stage of model.stages) {
    parts.push(`  - name: ${nameLine(stage.name)}`);
    parts.push(`    steps:`);
    for (const step of stage.steps) {
      parts.push(`      - uses: ${step.uses}`);
      parts.push(...indentWithBlock(step.with));
    }
  }

  parts.push(`notify:`);
  parts.push(`  on: [passed, failed]`);

  return parts.join("\n") + "\n";
}
