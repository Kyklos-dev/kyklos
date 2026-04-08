import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  PREDEFINED_STEPS,
  STEP_CATEGORIES,
  type PredefinedStep,
  type StepCategory,
  getStepMeta,
} from "../lib/predefinedSteps";
import {
  defaultPipelineModel,
  newId,
  type BuilderStage,
  type BuilderStep,
  type PipelineModel,
} from "../lib/pipelineModel";
import {
  formatStepExampleForKyklosYaml,
  serializePipelineToYaml,
} from "../lib/serializePipelineYaml";

type PipelineBuilderProps = {
  onYamlChange: (yaml: string) => void;
};

/** Rough position before measuring the popover; refined in useLayoutEffect. */
function computeInitialPopoverPosition(anchor: HTMLElement): {
  top: number;
  left: number;
  width: number;
} {
  const r = anchor.getBoundingClientRect();
  const gap = 8;
  const width = Math.min(420, window.innerWidth - 16);
  let left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
  const estH = 300;
  let top = r.bottom + gap;
  if (top + estH > window.innerHeight - 8) {
    top = Math.max(8, r.top - gap - estH);
  }
  return { top, left, width };
}

function measurePalettePopoverPosition(
  anchor: HTMLElement,
  panel: HTMLElement
): { top: number; left: number; width: number } {
  const r = anchor.getBoundingClientRect();
  const gap = 8;
  const width = Math.min(420, window.innerWidth - 16);
  let left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
  const h = panel.offsetHeight;
  let top = r.bottom + gap;
  if (top + h > window.innerHeight - 8) {
    top = Math.max(8, r.top - gap - h);
  }
  return { top, left, width };
}

export function PipelineBuilder({ onYamlChange }: PipelineBuilderProps) {
  const [model, setModel] = useState<PipelineModel>(() => defaultPipelineModel());
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  /** After adding from palette: focus the new step’s with-editor once. */
  const [editFocusStepId, setEditFocusStepId] = useState<string | null>(null);
  const [previewMeta, setPreviewMeta] = useState<PredefinedStep | null>(null);
  /** Target stage when adding from the palette modal (initialized from the highlighted stage). */
  const [paletteTargetStageId, setPaletteTargetStageId] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const paletteAnchorRef = useRef<HTMLButtonElement | null>(null);
  const stepPreviewPopoverRef = useRef<HTMLDivElement | null>(null);

  const closeStepPreview = useCallback(() => {
    setPreviewMeta(null);
    setPopoverPos(null);
  }, []);

  const clearEditFocus = useCallback(() => {
    setEditFocusStepId(null);
  }, []);

  const selectedStage = useMemo(() => {
    const id = selectedStageId ?? model.stages[0]?.id;
    return model.stages.find((s) => s.id === id) ?? model.stages[0];
  }, [model.stages, selectedStageId]);

  useEffect(() => {
    if (!selectedStageId && model.stages[0]) {
      setSelectedStageId(model.stages[0].id);
    }
  }, [model.stages, selectedStageId]);

  useEffect(() => {
    onYamlChange(serializePipelineToYaml(model));
  }, [model, onYamlChange]);

  useEffect(() => {
    if (!previewMeta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeStepPreview();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewMeta, closeStepPreview]);

  /** Pin popover to the palette button; flip above if it would clip the viewport. */
  useLayoutEffect(() => {
    if (!previewMeta) return;
    const anchor = paletteAnchorRef.current;
    const panel = stepPreviewPopoverRef.current;
    if (!anchor || !panel) return;
    setPopoverPos(measurePalettePopoverPosition(anchor, panel));
  }, [previewMeta]);

  useEffect(() => {
    if (!previewMeta) return;
    const onResize = () => {
      const anchor = paletteAnchorRef.current;
      const panel = stepPreviewPopoverRef.current;
      if (!anchor || !panel) return;
      setPopoverPos(measurePalettePopoverPosition(anchor, panel));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [previewMeta]);

  useEffect(() => {
    if (!previewMeta) return;
    const onScroll = () => closeStepPreview();
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [previewMeta, closeStepPreview]);

  /** Close when clicking outside the card and anchor (deferred so opening click does not fire). */
  useEffect(() => {
    if (!previewMeta) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (stepPreviewPopoverRef.current?.contains(t)) return;
      if (paletteAnchorRef.current?.contains(t)) return;
      closeStepPreview();
    };
    const timeoutId = window.setTimeout(() => {
      document.addEventListener("mousedown", onDocMouseDown);
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [previewMeta, closeStepPreview]);

  function updateModel(fn: (m: PipelineModel) => PipelineModel) {
    setModel((m) => fn(structuredClone(m)));
  }

  function addStage() {
    updateModel((m) => ({
      ...m,
      stages: [
        ...m.stages,
        {
          id: newId(),
          name: `stage-${m.stages.length + 1}`,
          steps: [],
        },
      ],
    }));
  }

  function removeStage(stageId: string) {
    updateModel((m) => {
      if (m.stages.length <= 1) return m;
      const stages = m.stages.filter((s) => s.id !== stageId);
      return { ...m, stages };
    });
    if (selectedStageId === stageId) {
      setSelectedStageId(null);
    }
  }

  function setStageName(stageId: string, name: string) {
    updateModel((m) => ({
      ...m,
      stages: m.stages.map((s) => (s.id === stageId ? { ...s, name } : s)),
    }));
  }

  function addStepFromPalette(meta: PredefinedStep, targetStageId: string): string {
    const withObj = meta.defaultWith
      ? { ...meta.defaultWith }
      : {};
    const step: BuilderStep = {
      id: newId(),
      uses: meta.uses,
      with: withObj,
    };
    updateModel((m) => ({
      ...m,
      stages: m.stages.map((s) =>
        s.id === targetStageId ? { ...s, steps: [...s.steps, step] } : s
      ),
    }));
    return step.id;
  }

  function removeStep(stageId: string, stepId: string) {
    updateModel((m) => ({
      ...m,
      stages: m.stages.map((s) =>
        s.id === stageId
          ? { ...s, steps: s.steps.filter((x) => x.id !== stepId) }
          : s
      ),
    }));
  }

  function moveStep(stageId: string, stepId: string, dir: -1 | 1) {
    updateModel((m) => ({
      ...m,
      stages: m.stages.map((s) => {
        if (s.id !== stageId) return s;
        const i = s.steps.findIndex((x) => x.id === stepId);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= s.steps.length) return s;
        const steps = [...s.steps];
        [steps[i], steps[j]] = [steps[j], steps[i]];
        return { ...s, steps };
      }),
    }));
  }

  function setStepWith(stageId: string, stepId: string, withObj: Record<string, unknown>) {
    updateModel((m) => ({
      ...m,
      stages: m.stages.map((s) =>
        s.id === stageId
          ? {
              ...s,
              steps: s.steps.map((x) =>
                x.id === stepId ? { ...x, with: withObj } : x
              ),
            }
          : s
      ),
    }));
  }

  const stepsByCategory = useMemo(() => {
    const map = new Map<StepCategory, PredefinedStep[]>();
    for (const c of STEP_CATEGORIES) map.set(c.id, []);
    for (const s of PREDEFINED_STEPS) {
      map.get(s.category)!.push(s);
    }
    return map;
  }, []);

  return (
    <div className="space-y-4 text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-muted block mb-1">Pipeline name</span>
          <input
            className="ky-input font-mono"
            value={model.pipelineName}
            onChange={(e) =>
              updateModel((m) => ({ ...m, pipelineName: e.target.value }))
            }
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-muted block mb-1">Agent model</span>
          <input
            className="ky-input font-mono"
            value={model.agentModel}
            onChange={(e) =>
              updateModel((m) => ({ ...m, agentModel: e.target.value }))
            }
          />
        </label>
        <label className="block sm:col-span-3">
          <span className="text-muted block mb-1">Prompt path (repo-relative)</span>
          <input
            className="ky-input font-mono"
            placeholder="./prompts/system.md"
            value={model.agentPrompt}
            onChange={(e) =>
              updateModel((m) => ({ ...m, agentPrompt: e.target.value }))
            }
          />
        </label>
      </div>

      {/* Stages + steps */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-900 font-medium">Pipeline stages</span>
          <button
            type="button"
            onClick={addStage}
            className="px-2 py-1 bg-surface-2 border border-surface-3 rounded text-muted hover:text-gray-900"
          >
            + Stage
          </button>
        </div>
        <div className="space-y-3">
          {model.stages.map((stage) => (
            <StageBlock
              key={stage.id}
              stage={stage}
              selected={selectedStage?.id === stage.id}
              onSelect={() => setSelectedStageId(stage.id)}
              onNameChange={(name) => setStageName(stage.id, name)}
              onRemove={() => removeStage(stage.id)}
              canRemove={model.stages.length > 1}
              onRemoveStep={(stepId) => removeStep(stage.id, stepId)}
              onMoveStep={(stepId, dir) => moveStep(stage.id, stepId, dir)}
              expandedStep={expandedStep}
              setExpandedStep={setExpandedStep}
              onSetWith={(stepId, w) => setStepWith(stage.id, stepId, w)}
              editFocusStepId={editFocusStepId}
              onEditFocusHandled={clearEditFocus}
            />
          ))}
        </div>
      </div>

      {/* Palette */}
      <div>
        <p className="text-gray-900 font-medium mb-2">Predefined steps</p>
        <p className="text-muted mb-3 text-[11px]">
          Click a step for a kyklos.yaml card next to it, pick the target stage, then{" "}
          <span className="text-gray-800">Add to stage</span>. Click a stage header to set the
          default stage for the next add.
        </p>
        <div
          className="space-y-4 max-h-64 overflow-y-auto pr-1"
          onScroll={() => {
            if (previewMeta) closeStepPreview();
          }}
        >
          {STEP_CATEGORIES.map((cat) => (
            <div key={cat.id}>
              <p className="text-[10px] uppercase tracking-wide text-muted mb-2">
                {cat.label}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {stepsByCategory.get(cat.id)!.map((meta) => (
                  <button
                    key={meta.uses}
                    type="button"
                    onClick={(e) => {
                      paletteAnchorRef.current = e.currentTarget;
                      setPopoverPos(computeInitialPopoverPosition(e.currentTarget));
                      setPreviewMeta(meta);
                      setPaletteTargetStageId(
                        selectedStage?.id ?? model.stages[0]?.id ?? null
                      );
                    }}
                    aria-label={`Show YAML example for ${meta.title} (${meta.uses})`}
                    className="text-left p-3 rounded-xl border border-surface-3 bg-surface-2/40 hover:border-accent/45 hover:bg-surface-2/80 transition-all duration-200 hover:shadow-md hover:shadow-black/20 active:scale-[0.99]"
                  >
                    <span className="font-mono text-accent text-[11px]">{meta.title}</span>
                    <span className="block text-muted mt-0.5 leading-snug">
                      {meta.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {previewMeta &&
        popoverPos &&
        createPortal(
          <div
            ref={stepPreviewPopoverRef}
            data-step-preview-card
            role="dialog"
            aria-modal="false"
            aria-labelledby="step-example-title"
            className="fixed z-[100] rounded-2xl border border-stone-200 bg-[#fafaf8] p-4 shadow-ky-lg animate-modal-in max-h-[min(72vh,28rem)] flex flex-col overflow-hidden"
            style={{
              top: popoverPos.top,
              left: popoverPos.left,
              width: popoverPos.width,
            }}
          >
            <h2 id="step-example-title" className="text-base font-bold mb-1 text-gray-900 shrink-0">
              {previewMeta.title}
            </h2>
            <p className="text-[11px] text-muted mb-2 shrink-0">
              Example under <code className="text-[10px]">pipeline</code> →{" "}
              <code className="text-[10px]">stages</code> →{" "}
              <code className="text-[10px]">steps</code>:
            </p>
            <pre className="text-[11px] font-mono bg-surface-2 border border-surface-3 rounded-lg p-3 overflow-x-auto text-gray-800 whitespace-pre shrink-0 max-h-[40vh] overflow-y-auto">
              {formatStepExampleForKyklosYaml(previewMeta)}
            </pre>
            {previewMeta.withHint && (
              <p className="text-[10px] text-muted mt-2 shrink-0">{previewMeta.withHint}</p>
            )}
            <label className="block mt-3 mb-1 shrink-0">
              <span className="text-[11px] text-muted block mb-1.5">Add to stage</span>
              <select
                className="ky-input font-mono w-full text-xs py-2"
                value={
                  model.stages.some((s) => s.id === paletteTargetStageId)
                    ? (paletteTargetStageId as string)
                    : (model.stages[0]?.id ?? "")
                }
                onChange={(e) => setPaletteTargetStageId(e.target.value)}
              >
                {model.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2 justify-end border-t border-surface-3/80 pt-3 mt-3 shrink-0">
              <button
                type="button"
                className="ky-btn-ghost"
                onClick={closeStepPreview}
              >
                Close
              </button>
              <button
                type="button"
                className="ky-btn-primary text-[11px] py-2 px-3"
                onClick={() => {
                  const sid =
                    paletteTargetStageId &&
                    model.stages.some((s) => s.id === paletteTargetStageId)
                      ? paletteTargetStageId
                      : model.stages[0]?.id;
                  if (!sid) return;
                  const newStepId = addStepFromPalette(previewMeta, sid);
                  setSelectedStageId(sid);
                  setExpandedStep(newStepId);
                  setEditFocusStepId(newStepId);
                  closeStepPreview();
                }}
              >
                Add to stage
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function StageBlock({
  stage,
  selected,
  onSelect,
  onNameChange,
  onRemove,
  canRemove,
  onRemoveStep,
  onMoveStep,
  expandedStep,
  setExpandedStep,
  onSetWith,
  editFocusStepId,
  onEditFocusHandled,
}: {
  stage: BuilderStage;
  selected: boolean;
  onSelect: () => void;
  onNameChange: (name: string) => void;
  onRemove: () => void;
  canRemove: boolean;
  onRemoveStep: (stepId: string) => void;
  onMoveStep: (stepId: string, dir: -1 | 1) => void;
  expandedStep: string | null;
  setExpandedStep: (id: string | null) => void;
  onSetWith: (stepId: string, w: Record<string, unknown>) => void;
  editFocusStepId: string | null;
  onEditFocusHandled: () => void;
}) {
  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        selected ? "border-accent/60 bg-surface-2/30" : "border-surface-3"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full flex items-center gap-2 px-3 py-2 bg-surface-2/80 border-b border-surface-3 text-left"
      >
        <span className="text-muted text-[10px] uppercase">Stage</span>
        <input
          className="flex-1 bg-transparent border-none outline-none font-mono text-gray-900 text-xs"
          value={stage.name}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onNameChange(e.target.value)}
        />
        {canRemove && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRemove();
              }
            }}
            className="text-muted hover:text-danger px-1"
          >
            ✕
          </span>
        )}
      </button>
      <div className="p-3 space-y-2 min-h-[48px]">
        {stage.steps.length === 0 ? (
          <p className="text-muted text-[11px]">No steps — add from the palette below.</p>
        ) : (
          stage.steps.map((step, idx) => (
            <StepRow
              key={step.id}
              step={step}
              index={idx}
              total={stage.steps.length}
              expanded={expandedStep === step.id}
              onToggleExpand={() =>
                setExpandedStep(expandedStep === step.id ? null : step.id)
              }
              onRemove={() => onRemoveStep(step.id)}
              onMoveUp={() => onMoveStep(step.id, -1)}
              onMoveDown={() => onMoveStep(step.id, 1)}
              onSetWith={(w) => onSetWith(step.id, w)}
              wantEditorFocus={editFocusStepId === step.id}
              onEditFocusHandled={onEditFocusHandled}
            />
          ))
        )}
      </div>
    </div>
  );
}

function StepRow({
  step,
  index,
  total,
  expanded,
  onToggleExpand,
  onRemove,
  onMoveUp,
  onMoveDown,
  onSetWith,
  wantEditorFocus,
  onEditFocusHandled,
}: {
  step: BuilderStep;
  index: number;
  total: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSetWith: (w: Record<string, unknown>) => void;
  wantEditorFocus?: boolean;
  onEditFocusHandled?: () => void;
}) {
  const meta = getStepMeta(step.uses);
  const title = meta?.title ?? step.uses;
  const hasWith = Object.keys(step.with).length > 0;
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const withTextareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (!expanded || !wantEditorFocus) return;
    rowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    withTextareaRef.current?.focus({ preventScroll: true });
    onEditFocusHandled?.();
  }, [expanded, wantEditorFocus, onEditFocusHandled]);

  return (
    <div
      ref={rowRef}
      id={`ky-pipeline-step-${step.id}`}
      className={`rounded border transition-colors duration-150 ${
        expanded
          ? "border-accent/50 bg-surface-2/55 ring-1 ring-accent/25 shadow-sm"
          : "border-surface-3/80 bg-surface-0/50 hover:border-surface-3"
      }`}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <span className="text-muted font-mono text-[10px] w-5">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-gray-800 truncate">{title}</div>
          <div className="text-[10px] text-muted truncate">{step.uses}</div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            className="px-1 text-muted hover:text-gray-900 disabled:opacity-30"
            disabled={index === 0}
            onClick={onMoveUp}
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            className="px-1 text-muted hover:text-gray-900 disabled:opacity-30"
            disabled={index >= total - 1}
            onClick={onMoveDown}
            title="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            className="px-1 text-muted hover:text-accent"
            onClick={onToggleExpand}
            title="Edit parameters"
          >
            {expanded ? "▲" : "▼"}
          </button>
          <button
            type="button"
            className="px-1 text-muted hover:text-danger"
            onClick={onRemove}
            title="Remove"
          >
            ✕
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-2 pb-2 border-t border-surface-3/50">
          {meta?.withHint && (
            <p className="text-[10px] text-muted mt-2 mb-1">{meta.withHint}</p>
          )}
          <label className="block text-[10px] text-muted mb-1">with (JSON)</label>
          <p className="text-[10px] text-muted/90 mb-1.5 leading-snug">
            Edit step variables; changes are saved when you leave this field and appear in the YAML
            preview.
          </p>
          <textarea
            ref={withTextareaRef}
            className="w-full bg-surface-2 border border-surface-3 rounded px-2 py-1.5 font-mono text-[11px] min-h-[6.5rem] h-28 outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
            spellCheck={false}
            defaultValue={JSON.stringify(step.with, null, 2)}
            key={step.id + JSON.stringify(step.with)}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              if (!raw) {
                onSetWith({});
                setJsonErr(null);
                return;
              }
              try {
                const parsed = JSON.parse(raw) as Record<string, unknown>;
                if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
                  throw new Error("with must be a JSON object");
                }
                onSetWith(parsed);
                setJsonErr(null);
              } catch {
                setJsonErr("Invalid JSON object");
              }
            }}
          />
          {jsonErr && <p className="text-danger text-[10px] mt-1">{jsonErr}</p>}
        </div>
      )}
      {!expanded && hasWith && (
        <div className="px-2 pb-1.5 text-[10px] text-muted font-mono truncate">
          with: {Object.keys(step.with).join(", ")}
        </div>
      )}
    </div>
  );
}
