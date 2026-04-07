import { useEffect, useMemo, useState } from "react";
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
import { serializePipelineToYaml } from "../lib/serializePipelineYaml";

type PipelineBuilderProps = {
  onYamlChange: (yaml: string) => void;
};

export function PipelineBuilder({ onYamlChange }: PipelineBuilderProps) {
  const [model, setModel] = useState<PipelineModel>(() => defaultPipelineModel());
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

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

  function addStepFromPalette(meta: PredefinedStep) {
    if (!selectedStage) return;
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
        s.id === selectedStage.id
          ? { ...s, steps: [...s.steps, step] }
          : s
      ),
    }));
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
            />
          ))}
        </div>
      </div>

      {/* Palette */}
      <div>
        <p className="text-gray-900 font-medium mb-2">Predefined steps</p>
        <p className="text-muted mb-3 text-[11px]">
          Adds to the highlighted stage (
          <span className="text-accent">{selectedStage?.name ?? "—"}</span>
          ). Click a stage header to select it.
        </p>
        <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
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
                    onClick={() => addStepFromPalette(meta)}
                    className="text-left p-3 rounded-xl border border-surface-3 bg-surface-2/40 hover:border-accent/45 hover:bg-surface-2/80 transition-all duration-200 hover:shadow-md hover:shadow-black/20 active:scale-[0.99]"
                  >
                    <span className="font-mono text-accent text-[11px]">{meta.title}</span>
                    <span className="block text-muted mt-0.5 leading-snug">
                      {meta.description}
                    </span>
                    <span className="block text-[10px] text-muted/80 mt-1 font-mono truncate">
                      {meta.uses}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
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
}) {
  const meta = getStepMeta(step.uses);
  const title = meta?.title ?? step.uses;
  const hasWith = Object.keys(step.with).length > 0;
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  return (
    <div className="rounded border border-surface-3/80 bg-surface-0/50">
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
          <textarea
            className="w-full bg-surface-2 border border-surface-3 rounded px-2 py-1.5 font-mono text-[11px] h-24 outline-none focus:border-accent"
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
