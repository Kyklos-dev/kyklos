/**
 * Map filesystem paths from GET /catalog/steps to kyklos `uses:` strings
 * (matches internal/engine/resolver.go built-ins).
 */
import { stringify } from "yaml";
import type { PredefinedStep } from "./predefinedSteps";
import { getStepMeta } from "./predefinedSteps";

export function fsPathToKyklosUses(fsPath: string): string {
  const base = fsPath.replace(/^.*[/\\]/, "").replace(/\.py$/i, "");
  return `kyklos/${base.replace(/_/g, "-")}`;
}

export function suggestedStepName(uses: string): string {
  return uses.replace(/^kyklos\//, "");
}

/**
 * Full YAML snippet for one step (list of one mapping) for the catalog / copy.
 */
function pickWithBlock(meta: PredefinedStep | undefined): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  if (meta.fullWith !== undefined && Object.keys(meta.fullWith).length > 0) {
    return meta.fullWith;
  }
  if (meta.defaultWith !== undefined && Object.keys(meta.defaultWith).length > 0) {
    return meta.defaultWith;
  }
  return undefined;
}

export function formatStepYamlExample(meta: PredefinedStep | undefined, uses: string): string {
  const step: Record<string, unknown> = {
    uses,
    name: suggestedStepName(uses),
  };

  const withBlock = pickWithBlock(meta);
  if (withBlock) {
    step.with = withBlock;
  }

  return stringify([step], { lineWidth: 106 }).trimEnd();
}

export function getCatalogMetaForPath(fsPath: string): PredefinedStep | undefined {
  return getStepMeta(fsPathToKyklosUses(fsPath));
}
