export interface BuilderStep {
  id: string;
  uses: string;
  /** Step parameters (kyklos `with:` block) */
  with: Record<string, unknown>;
}

export interface BuilderStage {
  id: string;
  name: string;
  steps: BuilderStep[];
}

export interface PipelineModel {
  pipelineName: string;
  agentModel: string;
  agentPrompt: string;
  stages: BuilderStage[];
}

export function newId(): string {
  return crypto.randomUUID();
}

export function defaultPipelineModel(): PipelineModel {
  return {
    pipelineName: "my-agent",
    agentModel: "claude-sonnet-4-6",
    agentPrompt: "./prompts/system.md",
    stages: [
      {
        id: newId(),
        name: "build",
        steps: [
          { id: newId(), uses: "kyklos/lint", with: {} },
          { id: newId(), uses: "kyklos/snapshot", with: {} },
        ],
      },
    ],
  };
}
