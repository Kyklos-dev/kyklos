import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
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
  parseStepBlockFromPipelineYaml,
  serializePipelineToYaml,
  serializeStepBlockForPipelineYaml,
} from "../lib/serializePipelineYaml";
import { docsUrl } from "../lib/docsBase";

type PipelineBuilderProps = {
  onYamlChange: (yaml: string) => void;
};

type StepEditorTarget = { stageId: string; stepId: string };

const DND_STEP_MIME = "application/x-kyklos-step";

function readStepDragPayload(e: DragEvent): { fromStageId: string; stepId: string } | null {
  try {
    const raw = e.dataTransfer.getData(DND_STEP_MIME);
    if (!raw) return null;
    const o = JSON.parse(raw) as { fromStageId?: string; stepId?: string };
    if (o.fromStageId && o.stepId) return { fromStageId: o.fromStageId, stepId: o.stepId };
  } catch {
    /* ignore */
  }
  return null;
}

export function PipelineBuilder({ onYamlChange }: PipelineBuilderProps) {
  const [model, setModel] = useState<PipelineModel>(() => defaultPipelineModel());
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [stepEditor, setStepEditor] = useState<StepEditorTarget | null>(null);
  const [draftYaml, setDraftYaml] = useState("");
  const [editorErr, setEditorErr] = useState<string | null>(null);
  /** While dragging a step row (for dimming + drop highlights). */
  const [draggingStep, setDraggingStep] = useState<{ stageId: string; stepId: string } | null>(null);

  const selectedStage = useMemo(() => {
    const id = selectedStageId ?? model.stages[0]?.id;
    return model.stages.find((s) => s.id === id) ?? model.stages[0];
  }, [model.stages, selectedStageId]);

  const editorTarget = useMemo(() => {
    if (!stepEditor) return null;
    const stage = model.stages.find((s) => s.id === stepEditor.stageId);
    const step = stage?.steps.find((x) => x.id === stepEditor.stepId);
    if (!stage || !step) return null;
    return { stage, step };
  }, [stepEditor, model.stages]);

  useEffect(() => {
    if (!selectedStageId && model.stages[0]) {
      setSelectedStageId(model.stages[0].id);
    }
  }, [model.stages, selectedStageId]);

  useEffect(() => {
    onYamlChange(serializePipelineToYaml(model));
  }, [model, onYamlChange]);

  useEffect(() => {
    if (stepEditor && !editorTarget) {
      setStepEditor(null);
    }
  }, [stepEditor, editorTarget]);

  useEffect(() => {
    if (!editorTarget) return;
    setDraftYaml(serializeStepBlockForPipelineYaml(editorTarget.step));
    setEditorErr(null);
  }, [editorTarget]);

  useEffect(() => {
    if (!stepEditor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStepEditor(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepEditor]);

  const closeEditor = useCallback(() => {
    setStepEditor(null);
    setEditorErr(null);
  }, []);

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
    setStepEditor((cur) => (cur?.stageId === stageId ? null : cur));
  }

  function setStageName(stageId: string, name: string) {
    updateModel((m) => ({
      ...m,
      stages: m.stages.map((s) => (s.id === stageId ? { ...s, name } : s)),
    }));
  }

  function addStepFromPalette(meta: PredefinedStep, targetStageId: string) {
    const withObj = meta.defaultWith ? { ...meta.defaultWith } : {};
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
  }

  function removeStep(stageId: string, stepId: string) {
    updateModel((m) => ({
      ...m,
      stages: m.stages.map((s) =>
        s.id === stageId ? { ...s, steps: s.steps.filter((x) => x.id !== stepId) } : s
      ),
    }));
    setStepEditor((cur) => (cur?.stepId === stepId ? null : cur));
  }

  /**
   * Move a step to another position: before `insertBeforeStepId`, or append if null.
   * Works across stages and for reordering within one stage.
   */
  function moveStepTo(
    fromStageId: string,
    stepId: string,
    toStageId: string,
    insertBeforeStepId: string | null
  ) {
    if (insertBeforeStepId === stepId) return;
    updateModel((m) => {
      const next = structuredClone(m) as PipelineModel;
      const fromS = next.stages.find((s) => s.id === fromStageId);
      const toS = next.stages.find((s) => s.id === toStageId);
      if (!fromS || !toS) return m;
      const fromIdx = fromS.steps.findIndex((x) => x.id === stepId);
      if (fromIdx < 0) return m;
      const [step] = fromS.steps.splice(fromIdx, 1);
      let insertIdx = toS.steps.length;
      if (insertBeforeStepId) {
        const j = toS.steps.findIndex((x) => x.id === insertBeforeStepId);
        if (j >= 0) insertIdx = j;
      }
      toS.steps.splice(insertIdx, 0, step);
      return next;
    });
  }

  function updateStepFields(
    stageId: string,
    stepId: string,
    fields: { uses: string; with: Record<string, unknown> }
  ) {
    updateModel((m) => ({
      ...m,
      stages: m.stages.map((s) =>
        s.id === stageId
          ? {
              ...s,
              steps: s.steps.map((x) =>
                x.id === stepId ? { ...x, uses: fields.uses, with: fields.with } : x
              ),
            }
          : s
      ),
    }));
  }

  function applyStepEditor() {
    if (!stepEditor) return;
    const parsed = parseStepBlockFromPipelineYaml(draftYaml);
    if (!parsed.ok) {
      setEditorErr(parsed.error);
      return;
    }
    updateStepFields(stepEditor.stageId, stepEditor.stepId, {
      uses: parsed.uses,
      with: parsed.with,
    });
    closeEditor();
  }

  const stepsByCategory = useMemo(() => {
    const map = new Map<StepCategory, PredefinedStep[]>();
    for (const c of STEP_CATEGORIES) map.set(c.id, []);
    for (const s of PREDEFINED_STEPS) {
      map.get(s.category)!.push(s);
    }
    return map;
  }, []);

  const editorMeta = editorTarget ? getStepMeta(editorTarget.step.uses) : null;
  const editorTitle = editorMeta?.title ?? editorTarget?.step.uses ?? "Step";

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
              stageId={stage.id}
              selected={selectedStage?.id === stage.id}
              onSelect={() => setSelectedStageId(stage.id)}
              onNameChange={(name) => setStageName(stage.id, name)}
              onRemove={() => removeStage(stage.id)}
              canRemove={model.stages.length > 1}
              onRemoveStep={(stepId) => removeStep(stage.id, stepId)}
              onMoveStepTo={(fromStageId, stepId, insertBeforeStepId) =>
                moveStepTo(fromStageId, stepId, stage.id, insertBeforeStepId)
              }
              onOpenStepEditor={(stepId) => setStepEditor({ stageId: stage.id, stepId })}
              draggingStep={draggingStep}
              onStepDragStart={(stageId, stepId) => setDraggingStep({ stageId, stepId })}
              onStepDragEnd={() => setDraggingStep(null)}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="text-gray-900 font-medium mb-2">Predefined steps</p>
        <p className="text-muted mb-3 text-[11px]">
          Click to add to the highlighted stage (
          <span className="text-accent">{selectedStage?.name ?? "—"}</span>
          ). Click the <span className="text-gray-800">main area</span> of a step to edit it. Drag the{" "}
          <span className="text-gray-800">⋮⋮</span> handle to reorder or move to another stage; ✕ removes.
        </p>
        <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
          {STEP_CATEGORIES.map((cat) => (
            <div key={cat.id}>
              <p className="text-[10px] uppercase tracking-wide text-muted mb-2">
                {cat.label}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {stepsByCategory.get(cat.id)!.map((meta) => (
                  <div
                    key={meta.uses}
                    className="rounded-xl border border-surface-3 bg-surface-2/40 hover:border-accent/45 hover:bg-surface-2/80 transition-all duration-200 hover:shadow-md hover:shadow-black/20 flex flex-col"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        const sid = selectedStage?.id ?? model.stages[0]?.id;
                        if (!sid) return;
                        addStepFromPalette(meta, sid);
                        setSelectedStageId(sid);
                      }}
                      aria-label={`Add step ${meta.title} (${meta.uses}) to highlighted stage`}
                      className="text-left p-3 flex-1 rounded-t-xl active:scale-[0.99]"
                    >
                      <span className="font-mono text-accent text-[11px]">{meta.title}</span>
                      <span className="block text-muted mt-0.5 leading-snug">{meta.description}</span>
                    </button>
                    <div className="px-3 pb-2 flex justify-end border-t border-surface-3/50">
                      <a
                        href={docsUrl(meta.docPath)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-accent hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Documentation
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {stepEditor &&
        editorTarget &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto bg-slate-900/40 backdrop-blur-[2px] animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="step-editor-title"
            onClick={closeEditor}
          >
            <div
              className="ky-modal-panel max-w-lg w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id="step-editor-title"
                className="text-lg font-bold mb-2 text-gray-900 font-mono tracking-tight"
              >
                {editorTitle}
              </h2>
              <p className="text-[11px] text-muted mb-3 leading-snug">
                Example under <code className="text-[10px] text-stone-600">pipeline</code> →{" "}
                <code className="text-[10px] text-stone-600">stages</code> →{" "}
                <code className="text-[10px] text-stone-600">steps</code>:
              </p>
              {editorMeta?.withHint && (
                <p className="text-[10px] text-muted mb-3 leading-snug">{editorMeta.withHint}</p>
              )}
              {editorMeta?.docPath && (
                <p className="text-[11px] mb-3">
                  <a
                    href={docsUrl(editorMeta.docPath)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline"
                  >
                    Documentation for this step
                  </a>
                </p>
              )}
              <div className="rounded-xl border border-stone-200/90 bg-stone-100/90 p-3 shadow-inner">
                <textarea
                  className="w-full min-h-[11rem] bg-transparent border-0 rounded-lg p-1 text-[11px] leading-relaxed font-mono text-stone-900 placeholder:text-stone-400 outline-none resize-y"
                  spellCheck={false}
                  aria-label="Step YAML"
                  value={draftYaml}
                  onChange={(e) => {
                    setDraftYaml(e.target.value);
                    setEditorErr(null);
                  }}
                />
              </div>
              {editorErr && (
                <p className="text-danger text-[11px] mt-2 px-0.5">{editorErr}</p>
              )}
              <div className="flex gap-3 justify-end border-t border-surface-3/80 pt-4 mt-5">
                <button type="button" className="ky-btn-ghost" onClick={closeEditor}>
                  Close
                </button>
                <button type="button" className="ky-btn-primary min-w-[7rem]" onClick={applyStepEditor}>
                  Save
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function StageBlock({
  stage,
  stageId,
  selected,
  onSelect,
  onNameChange,
  onRemove,
  canRemove,
  onRemoveStep,
  onMoveStepTo,
  onOpenStepEditor,
  draggingStep,
  onStepDragStart,
  onStepDragEnd,
}: {
  stage: BuilderStage;
  stageId: string;
  selected: boolean;
  onSelect: () => void;
  onNameChange: (name: string) => void;
  onRemove: () => void;
  canRemove: boolean;
  onRemoveStep: (stepId: string) => void;
  onMoveStepTo: (fromStageId: string, stepId: string, insertBeforeStepId: string | null) => void;
  onOpenStepEditor: (stepId: string) => void;
  draggingStep: { stageId: string; stepId: string } | null;
  onStepDragStart: (stageId: string, stepId: string) => void;
  onStepDragEnd: () => void;
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
          <div
            className="rounded-lg border border-dashed border-surface-3/90 bg-surface-0/40 px-3 py-6 text-center text-[11px] text-muted transition-colors"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const p = readStepDragPayload(e);
              if (!p) return;
              onMoveStepTo(p.fromStageId, p.stepId, null);
              onStepDragEnd();
            }}
          >
            No steps — add from the palette, or <span className="text-gray-800">drop a step here</span> from another
            stage.
          </div>
        ) : (
          <>
            {stage.steps.map((step, idx) => (
              <StepRow
                key={step.id}
                step={step}
                stageId={stageId}
                index={idx}
                isDragging={Boolean(
                  draggingStep &&
                    draggingStep.stageId === stageId &&
                    draggingStep.stepId === step.id
                )}
                onOpenEditor={() => onOpenStepEditor(step.id)}
                onRemove={() => onRemoveStep(step.id)}
                onMoveStepTo={onMoveStepTo}
                onStepDragStart={onStepDragStart}
                onStepDragEnd={onStepDragEnd}
              />
            ))}
            <div
              className="rounded-md border border-dashed border-transparent py-1.5 text-center text-[10px] text-muted/80 hover:border-accent/30 hover:bg-accent/5 transition-colors"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const p = readStepDragPayload(e);
                if (!p) return;
                onMoveStepTo(p.fromStageId, p.stepId, null);
                onStepDragEnd();
              }}
            >
              Drop here to append to this stage
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StepRow({
  step,
  stageId,
  index,
  isDragging,
  onOpenEditor,
  onRemove,
  onMoveStepTo,
  onStepDragStart,
  onStepDragEnd,
}: {
  step: BuilderStep;
  stageId: string;
  index: number;
  isDragging: boolean;
  onOpenEditor: () => void;
  onRemove: () => void;
  onMoveStepTo: (fromStageId: string, stepId: string, insertBeforeStepId: string | null) => void;
  onStepDragStart: (stageId: string, stepId: string) => void;
  onStepDragEnd: () => void;
}) {
  const meta = getStepMeta(step.uses);
  const title = meta?.title ?? step.uses;
  const hasWith = Object.keys(step.with).length > 0;

  return (
    <div
      id={`ky-pipeline-step-${step.id}`}
      className={`rounded border border-surface-3/80 bg-surface-0/50 flex items-stretch min-h-[3.25rem] hover:border-accent/45 transition-colors ${
        isDragging ? "opacity-50" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const p = readStepDragPayload(e);
        if (!p) return;
        onMoveStepTo(p.fromStageId, p.stepId, step.id);
        onStepDragEnd();
      }}
    >
      <span
        draggable={true}
        role="presentation"
        className="flex w-7 shrink-0 cursor-grab active:cursor-grabbing items-center justify-center text-muted hover:text-gray-700 border-r border-surface-3/60 bg-surface-2/30 select-none text-[10px] leading-none tracking-tighter px-0.5"
        title="Drag to reorder or move to another stage"
        aria-label="Drag to reorder"
        onDragStart={(e) => {
          e.dataTransfer.setData(
            DND_STEP_MIME,
            JSON.stringify({ fromStageId: stageId, stepId: step.id })
          );
          e.dataTransfer.effectAllowed = "move";
          onStepDragStart(stageId, step.id);
        }}
        onDragEnd={() => onStepDragEnd()}
      >
        ⋮⋮
      </span>
      <button
        type="button"
        aria-label={`Edit step ${title}`}
        className="flex flex-1 min-w-0 items-start gap-2 px-3 py-2 text-left cursor-pointer border-0 bg-transparent hover:bg-surface-2/50"
        onClick={onOpenEditor}
      >
        <span className="text-muted font-mono text-[10px] w-4 shrink-0 pt-0.5">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-gray-800 truncate text-[11px]">{title}</div>
          <div className="text-[10px] text-muted truncate">{step.uses}</div>
          {!hasWith ? (
            <div className="text-[9px] text-accent/90 mt-1 font-medium">Click to edit YAML and variables</div>
          ) : (
            <div className="text-[9px] text-muted font-mono truncate mt-0.5">
              with: {Object.keys(step.with).join(", ")}
            </div>
          )}
        </div>
      </button>
      <div className="flex items-center shrink-0 border-l border-surface-3/60 pl-1 pr-1.5 py-1 self-stretch bg-surface-0/80">
        <button
          type="button"
          className="px-1.5 text-muted hover:text-danger rounded"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
