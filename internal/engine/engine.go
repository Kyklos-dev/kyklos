package engine

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/kyklos/kyklos/internal/artifacts"
	"github.com/kyklos/kyklos/internal/config"
	"github.com/kyklos/kyklos/internal/evalbundle"
	"github.com/kyklos/kyklos/internal/models"
	"github.com/kyklos/kyklos/internal/notify"
	"github.com/kyklos/kyklos/internal/store"
)

const defaultMaxGoto = 10

// Engine is the core pipeline executor.
type Engine struct {
	store        store.Store
	runner       *Runner
	resolver     *Resolver
	gate         GateEvaluator
	notifier     notify.Notifier
	wsMgr        *WorkspaceManager
	artifactRoot string // durable copies of step artifacts; empty disables persistence
}

// New creates a fully-wired Engine. notifier may be nil (defaults to LogNotifier).
// artifactRoot is the directory for persisted step files (e.g. workspace_root/artifact_store); empty skips persistence.
func New(
	st store.Store,
	runner *Runner,
	resolver *Resolver,
	wsMgr *WorkspaceManager,
	notifier notify.Notifier,
	artifactRoot string,
) *Engine {
	if notifier == nil {
		notifier = &notify.LogNotifier{}
	}
	return &Engine{
		store:        st,
		runner:       runner,
		resolver:     resolver,
		gate:         GateEvaluator{},
		notifier:     notifier,
		wsMgr:        wsMgr,
		artifactRoot: artifactRoot,
	}
}

// RunPipeline is the public entry point called by the scheduler and webhook handlers.
// It prepares the workspace, creates a run record, executes all stages, and stores results.
func (e *Engine) RunPipeline(ctx context.Context, pipelineID string, req models.TriggerRequest) error {
	// Load pipeline definition from store
	pipeline, err := e.store.GetPipeline(ctx, pipelineID)
	if err != nil {
		return fmt.Errorf("get pipeline %q: %w", pipelineID, err)
	}

	prep := pipeline
	if wid := strings.TrimSpace(pipeline.WorkspaceID); wid != "" {
		dws, err := e.store.GetWorkspace(ctx, wid)
		if err != nil {
			return fmt.Errorf("get workspace %q: %w", wid, err)
		}
		url := strings.TrimSpace(dws.RepoURL)
		if url == "" {
			return fmt.Errorf("workspace %q has empty repo_url", dws.Name)
		}
		p := *pipeline
		cfg := pipeline.Config
		defBr := strings.TrimSpace(dws.DefaultBranch)
		if defBr == "" {
			defBr = "main"
		}
		repoCfg := &config.RepositoryConfig{
			URL:    url,
			Branch: defBr,
		}
		if cfg.Repository != nil && strings.TrimSpace(cfg.Repository.TokenEnv) != "" {
			repoCfg.TokenEnv = cfg.Repository.TokenEnv
		}
		cfg.Repository = repoCfg
		p.Config = cfg
		prep = &p
		slog.Info("clone from dashboard workspace", "workspace_id", dws.ID, "repo_url", url, "default_branch", defBr)
	}

	// Prepare the workspace (git worktree or local override)
	ws, err := e.wsMgr.Prepare(ctx, prep, req)
	if err != nil {
		return fmt.Errorf("prepare workspace: %w", err)
	}
	defer ws.Cleanup()

	// Parse kyklos.yaml from the workspace.
	// If the file doesn't exist (e.g. UI-created pipeline with no git repo),
	// fall back to the config already stored in the database.
	var cfg *config.PipelineConfig
	yamlPath := filepath.Join(ws.Path, pipeline.YAMLPath)
	if _, statErr := os.Stat(yamlPath); statErr == nil {
		cfg, err = ParsePipelineFile(yamlPath, ws.Path)
		if err != nil {
			return fmt.Errorf("parse pipeline yaml: %w", err)
		}
	} else {
		stored := pipeline.Config
		cfg = &stored
		slog.Info("no yaml on disk, using stored config", "pipeline", pipeline.Name)
	}

	var resolvedBundle *evalbundle.Resolved
	if cfg.EvalBundle != nil {
		var berr error
		resolvedBundle, berr = evalbundle.Resolve(ws.Path, cfg)
		if berr != nil {
			return fmt.Errorf("eval bundle: %w", berr)
		}
	}

	// Create and start run record (prefer resolved ref from git workspace over trigger hints)
	gitSHA := ws.GitSHA
	if gitSHA == "" {
		gitSHA = req.GitSHA
	}
	gitBranch := ws.GitBranch
	if gitBranch == "" {
		gitBranch = req.GitBranch
	}
	run := &models.Run{
		PipelineID: pipelineID,
		Trigger:    req.Trigger,
		GitSHA:     gitSHA,
		GitBranch:  gitBranch,
	}
	if resolvedBundle != nil {
		run.EvalBundleID = resolvedBundle.Label
		run.EvalBundleFingerprint = resolvedBundle.Fingerprint
	}
	if err := e.store.CreateRun(ctx, run); err != nil {
		return fmt.Errorf("create run: %w", err)
	}
	if err := e.store.StartRun(ctx, run.ID); err != nil {
		return fmt.Errorf("start run: %w", err)
	}

	startLine := fmt.Sprintf("▶ Run started — pipeline %q", pipeline.Name)
	if resolvedBundle != nil && resolvedBundle.Fingerprint != "" {
		fp := resolvedBundle.Fingerprint
		if len(fp) > 12 {
			fp = fp[:12] + "…"
		}
		if resolvedBundle.Label != "" {
			startLine += fmt.Sprintf(" — eval bundle %q fingerprint %s", resolvedBundle.Label, fp)
		} else {
			startLine += fmt.Sprintf(" — eval bundle fingerprint %s", fp)
		}
	}
	_ = e.store.AppendLog(ctx, &models.LogEntry{
		RunID:     run.ID,
		StageName: "",
		StepName:  "",
		Line:      startLine,
	})

	slog.Info("pipeline run started",
		"pipeline", pipeline.Name,
		"run_id", run.ID,
		"trigger", req.Trigger,
		"workspace", ws.Path,
	)

	// Execute all stages
	execErr := e.execute(ctx, pipeline, run, cfg, ws.Path)

	if execErr != nil {
		_ = e.store.FinishRun(ctx, run.ID, models.RunStatusFailed, execErr.Error())
		e.notifier.Notify(ctx, pipeline.Name, run, "failure")
		slog.Info("pipeline run failed", "pipeline", pipeline.Name, "run_id", run.ID, "err", execErr)
		return execErr
	}

	_ = e.store.AppendLog(ctx, &models.LogEntry{
		RunID: run.ID,
		Line:  "— Run finished successfully —",
	})
	_ = e.store.FinishRun(ctx, run.ID, models.RunStatusPassed, "")
	e.notifier.Notify(ctx, pipeline.Name, run, "success")
	slog.Info("pipeline run passed", "pipeline", pipeline.Name, "run_id", run.ID)
	return nil
}

// execute runs the pipeline stages in order, handling retries, goto loops,
// and on_fail routing. It is the inner loop — workspace and run record are
// already prepared by RunPipeline.
func (e *Engine) execute(
	ctx context.Context,
	pipeline *models.Pipeline,
	run *models.Run,
	cfg *config.PipelineConfig,
	workspace string,
) error {
	state := NewRunState()
	stageNames := extractStageNames(cfg)

	globalEnv, err := e.store.GetGlobalEnv(ctx)
	if err != nil {
		slog.Warn("load global env failed", "err", err)
		globalEnv = nil
	}
	stepEnv := MergeEnv(globalEnv, cfg.Env)

	// Per-run resolver with the workspace baked in
	resolver := e.resolver.WithWorkspace(workspace)

	maxGoto := cfg.MaxGoto
	if maxGoto <= 0 {
		maxGoto = defaultMaxGoto
	}

	i := 0          // current stage index
	retryCount := 0 // retries of the current stage

	for i < len(cfg.Pipeline) {
		stage := cfg.Pipeline[i]

		// ── Execute the stage ─────────────────────────────────────────────
		now := time.Now().UTC()
		stageResult := models.StageResult{
			RunID:      run.ID,
			StageName:  stage.Name,
			Status:     models.StageStatusRunning,
			RetryCount: retryCount,
			StartedAt:  &now,
		}

		slog.Info("stage started", "run_id", run.ID, "stage", stage.Name, "retry", retryCount)

		stepErr := e.runStage(ctx, run, stage, &stageResult, state, stageNames, cfg, resolver, stepEnv)

		finishedAt := time.Now().UTC()
		stageResult.FinishedAt = &finishedAt

		// ── Evaluate pass_if gate ─────────────────────────────────────────
		gateResults, gatePassed := e.gate.Check(stage.PassIf, stageResult.Steps)
		stageResult.GateResults = gateResults

		if stepErr == nil && gatePassed {
			stageResult.Status = models.StageStatusPassed
		} else {
			stageResult.Status = models.StageStatusFailed
		}

		state.AddStageResult(stageResult)
		if err := e.store.SaveStageResult(ctx, &stageResult); err != nil {
			slog.Warn("save stage result failed", "err", err)
		}

		slog.Info("stage finished",
			"run_id", run.ID,
			"stage", stage.Name,
			"status", stageResult.Status,
		)

		// ── Route on success ──────────────────────────────────────────────
		if stepErr == nil && gatePassed {
			i++
			retryCount = 0
			continue
		}

		// ── Route on failure ──────────────────────────────────────────────
		onFail := stage.OnFail

		// Try retry first
		maxRetries := onFail.Retry.MaxAttempts
		if maxRetries > 0 && retryCount < maxRetries {
			retryCount++
			slog.Info("retrying stage",
				"stage", stage.Name,
				"attempt", retryCount,
				"max", maxRetries,
			)
			if onFail.Retry.DelaySeconds > 0 {
				select {
				case <-time.After(time.Duration(onFail.Retry.DelaySeconds) * time.Second):
				case <-ctx.Done():
					return ctx.Err()
				}
			}
			continue // re-run same stage
		}

		retryCount = 0

		// Determine final action after retries exhausted
		then := onFail.Then
		if then == "" {
			then = "abort" // default when on_fail not configured
		}

		switch then {
		case "continue":
			// Record failure, advance to next stage
			i++

		case "goto":
			target := onFail.Goto
			state.LoopCount[target]++
			if state.LoopCount[target] > maxGoto {
				return fmt.Errorf(
					"max_goto limit (%d) exceeded: stage %q tried to goto %q too many times",
					maxGoto, stage.Name, target,
				)
			}
			slog.Info("goto stage",
				"from", stage.Name,
				"to", target,
				"loop", state.LoopCount[target],
			)
			i = indexOfStage(cfg.Pipeline, target)

		default: // "abort"
			if stepErr != nil {
				return fmt.Errorf("stage %q: step error: %w", stage.Name, stepErr)
			}
			return fmt.Errorf("stage %q: gate failed:\n%s",
				stage.Name, FormatGateFailure(gateResults))
		}
	}

	return nil
}

// runStage executes all steps within a stage sequentially.
// It populates stageResult.Steps in-place and returns the first step error, if any.
// A step reporting passed=false does NOT return an error — it's a logical failure
// handled by the gate. Only subprocess/system errors are returned as errors.
func (e *Engine) runStage(
	ctx context.Context,
	run *models.Run,
	stage config.Stage,
	stageResult *models.StageResult,
	state *RunState,
	stageNames []string,
	cfg *config.PipelineConfig,
	resolver *Resolver,
	stepEnv map[string]string,
) error {
	for _, step := range stage.Steps {
		stepName := step.StepName()

		// Resolve step path
		stepPath, err := resolver.Resolve(step.Uses)
		if err != nil {
			stepResult := failedStep(stepName, step.Uses, fmt.Sprintf("resolve error: %s", err))
			stageResult.Steps = append(stageResult.Steps, stepResult)
			return fmt.Errorf("resolve step %q: %w", step.Uses, err)
		}

		// Build context for this step
		kyklosCtx := BuildContext(run.ID, resolver.workspace, *cfg, step, state, stageNames, stepEnv)

		_ = e.store.AppendLog(ctx, &models.LogEntry{
			RunID:     run.ID,
			StageName: stage.Name,
			StepName:  stepName,
			Line:      fmt.Sprintf("▶ Step started — %s (%s)", stepName, step.Uses),
		})

		// Stream logs to store in background
		logChan := make(chan string, 256)
		logDone := make(chan struct{})
		go func(sn string) {
			defer close(logDone)
			for line := range logChan {
				_ = e.store.AppendLog(ctx, &models.LogEntry{
					RunID:     run.ID,
					StageName: stage.Name,
					StepName:  sn,
					Line:      line,
				})
			}
		}(stepName)

		slog.Info("step started", "run_id", run.ID, "stage", stage.Name, "step", stepName)

		stepResult, stepErr := func() (*models.StepResult, error) {
			stepCtx := ctx
			var cancel context.CancelFunc
			if step.TimeoutSeconds > 0 {
				stepCtx, cancel = context.WithTimeout(ctx, time.Duration(step.TimeoutSeconds)*time.Second)
				defer cancel()
			}
			return e.runner.RunStep(stepCtx, RunStepRequest{
				StepPath:  stepPath,
				Uses:      step.Uses,
				Context:   kyklosCtx,
				RunID:     run.ID,
				StageName: stage.Name,
				StepName:  stepName,
				LogChan:   logChan,
			})
		}()
		close(logChan)
		<-logDone

		if stepErr != nil {
			sr := failedStep(stepName, step.Uses, fmt.Sprintf("step error: %s", stepErr))
			stageResult.Steps = append(stageResult.Steps, sr)
			return stepErr
		}

		slog.Info("step finished",
			"run_id", run.ID,
			"stage", stage.Name,
			"step", stepName,
			"passed", stepResult.Passed,
		)

		if e.artifactRoot != "" && len(stepResult.Artifacts) > 0 {
			pendings, aerr := artifacts.PersistFiles(e.artifactRoot, run.ID, resolver.workspace, stepResult.Artifacts)
			if aerr != nil {
				slog.Warn("artifact persist", "run_id", run.ID, "step", stepName, "err", aerr)
			} else if len(pendings) > 0 {
				var refs []map[string]any
				for _, p := range pendings {
					rec := &models.RunArtifact{
						ID:          p.ID,
						RunID:       run.ID,
						StageName:   stage.Name,
						StepName:    stepName,
						LogicalName: p.LogicalName,
						StoragePath: p.StoragePath,
						SizeBytes:   p.SizeBytes,
					}
					if err := e.store.InsertRunArtifact(ctx, rec); err != nil {
						slog.Warn("insert run artifact", "err", err)
						continue
					}
					refs = append(refs, map[string]any{
						"id": p.ID, "logical_name": p.LogicalName, "size_bytes": p.SizeBytes,
					})
				}
				if len(refs) > 0 {
					if stepResult.Metadata == nil {
						stepResult.Metadata = map[string]any{}
					}
					stepResult.Metadata["kyklos_persisted_artifacts"] = refs
				}
			}
		}

		stageResult.Steps = append(stageResult.Steps, *stepResult)

		// If step reported logical failure, stop remaining steps in this stage.
		// The gate will detect this and apply on_fail routing.
		if !stepResult.Passed {
			break
		}
	}
	return nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func extractStageNames(cfg *config.PipelineConfig) []string {
	names := make([]string, len(cfg.Pipeline))
	for i, s := range cfg.Pipeline {
		names[i] = s.Name
	}
	return names
}

func indexOfStage(stages []config.Stage, name string) int {
	for i, s := range stages {
		if s.Name == name {
			return i
		}
	}
	return 0 // fallback; parser validates goto targets exist
}

func failedStep(name, uses, reason string) models.StepResult {
	return models.StepResult{
		Name:      name,
		Uses:      uses,
		Status:    models.StageStatusFailed,
		Passed:    false,
		Scores:    map[string]float64{},
		Metadata:  map[string]any{},
		Artifacts: []string{},
		Logs:      []string{reason},
	}
}
