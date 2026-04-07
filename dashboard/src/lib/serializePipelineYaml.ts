import type { PipelineModel } from "./pipelineModel";

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
