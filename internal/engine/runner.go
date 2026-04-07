package engine

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"time"

	"github.com/kyklos/kyklos/internal/models"
)

// StepRawResult is the JSON the step writes to FD 3.
type StepRawResult struct {
	Scores    map[string]float64 `json:"scores"`
	Passed    bool               `json:"passed"`
	Metadata  map[string]any     `json:"metadata"`
	Artifacts []string           `json:"artifacts"`
	Logs      []string           `json:"logs"`
}

// RunStepRequest bundles all inputs needed to execute one step.
type RunStepRequest struct {
	StepPath  string         // absolute path to the Python step file
	Uses      string         // original uses string (e.g. "kyklos/llm-judge")
	Context   *KyklosContext // serialised to stdin
	RunID     string
	StageName string
	StepName  string
	LogChan   chan<- string // receives stdout/stderr lines in real time
}

// Runner executes Python step subprocesses and collects their results.
type Runner struct {
	pythonBin string // e.g. "/home/user/.kyklos/venv/bin/python" or "python3"
}

// NewRunner creates a Runner. If pythonBin is empty it falls back to "python3".
func NewRunner(pythonBin string) *Runner {
	if pythonBin == "" {
		pythonBin = "python3"
	}
	return &Runner{pythonBin: pythonBin}
}

// RunStep executes one step as a Python subprocess (Fix 4: FD 3 result protocol).
//
// Protocol:
//   - KyklosContext JSON → step stdin
//   - Step stdout/stderr → logChan (streamed in real time)
//   - Step result JSON  → FD 3 pipe (one JSON line, written by emit_result())
//
// Error conditions:
//   - Non-zero exit code                  → error
//   - Exit 0 with no result on FD 3       → hard error (STEP_NO_RESULT)
//   - Malformed result JSON               → error
func (r *Runner) RunStep(ctx context.Context, req RunStepRequest) (*models.StepResult, error) {
	// Serialize context to JSON for stdin
	ctxJSON, err := json.Marshal(req.Context)
	if err != nil {
		return nil, fmt.Errorf("marshal context: %w", err)
	}

	// FD 3 pipe for result (Fix 4)
	resultR, resultW, err := os.Pipe()
	if err != nil {
		return nil, fmt.Errorf("create result pipe: %w", err)
	}

	cmd := exec.CommandContext(ctx, r.pythonBin, req.StepPath)

	// Pass result write-end as FD 3 (ExtraFiles[0] → stdin=0,stdout=1,stderr=2,extra[0]=3)
	cmd.ExtraFiles = []*os.File{resultW}

	// Build subprocess environment
	cmd.Env = buildEnv(req.Context.Env, req.Context.Workspace, req.RunID)

	// Stdin carries the KyklosContext JSON
	pr, pw, err := os.Pipe()
	if err != nil {
		resultR.Close(); resultW.Close()
		return nil, fmt.Errorf("create stdin pipe: %w", err)
	}
	cmd.Stdin = pr

	// Capture stdout and stderr for streaming to logChan
	stdoutR, stdoutW, err := os.Pipe()
	if err != nil {
		pr.Close(); pw.Close(); resultR.Close(); resultW.Close()
		return nil, fmt.Errorf("create stdout pipe: %w", err)
	}
	stderrR, stderrW, err := os.Pipe()
	if err != nil {
		pr.Close(); pw.Close(); resultR.Close(); resultW.Close()
		stdoutR.Close(); stdoutW.Close()
		return nil, fmt.Errorf("create stderr pipe: %w", err)
	}
	cmd.Stdout = stdoutW
	cmd.Stderr = stderrW

	if err := cmd.Start(); err != nil {
		pr.Close(); pw.Close(); resultR.Close(); resultW.Close()
		stdoutR.Close(); stdoutW.Close(); stderrR.Close(); stderrW.Close()
		return nil, fmt.Errorf("start step: %w", err)
	}

	// Close write ends in parent immediately after Start
	resultW.Close()
	stdoutW.Close()
	stderrW.Close()

	// Write context JSON to stdin, then close
	go func() {
		defer pw.Close()
		pw.Write(ctxJSON) //nolint:errcheck
	}()

	// Stream stdout → logChan
	logDone := make(chan struct{})
	go func() {
		defer close(logDone)
		scanner := bufio.NewScanner(stdoutR)
		for scanner.Scan() {
			if req.LogChan != nil {
				req.LogChan <- scanner.Text()
			}
		}
	}()

	// Stream stderr → logChan with prefix
	go func() {
		scanner := bufio.NewScanner(stderrR)
		for scanner.Scan() {
			if req.LogChan != nil {
				req.LogChan <- "[stderr] " + scanner.Text()
			}
		}
	}()

	// Read result from FD 3 — blocks until step closes the pipe
	resultBytes, readErr := io.ReadAll(resultR)
	resultR.Close()

	// Wait for stdout streaming to finish, then wait for process
	<-logDone
	waitErr := cmd.Wait()
	stdoutR.Close()
	stderrR.Close()
	pr.Close()

	exitCode := 0
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}

	if waitErr != nil {
		switch {
		case errors.Is(ctx.Err(), context.DeadlineExceeded):
			return nil, fmt.Errorf("STEP_TIMEOUT: step %q: %w", req.StepName, ctx.Err())
		case errors.Is(ctx.Err(), context.Canceled):
			return nil, fmt.Errorf("STEP_CANCELLED: step %q: %w", req.StepName, ctx.Err())
		case exitCode != 0:
			return nil, fmt.Errorf("STEP_EXIT_%d: step %q failed", exitCode, req.StepName)
		default:
			return nil, fmt.Errorf("step %q: %w", req.StepName, waitErr)
		}
	}

	// Exit 0 with no result on FD 3 is a hard error (Fix 4)
	if readErr != nil {
		return nil, fmt.Errorf("read result pipe: %w", readErr)
	}
	if len(resultBytes) == 0 {
		return nil, fmt.Errorf(
			"STEP_NO_RESULT: step %q exited 0 but emitted no result on FD 3 — "+
				"did you forget to call emit_result()?", req.StepName,
		)
	}

	var raw StepRawResult
	if err := json.Unmarshal(resultBytes, &raw); err != nil {
		return nil, fmt.Errorf("parse result JSON from step %q: %w", req.StepName, err)
	}

	status := models.StageStatusPassed
	if !raw.Passed {
		status = models.StageStatusFailed
	}

	// Ensure no nil slices or maps — JSON marshals nil as null which
	// breaks the frontend (Object.keys(null) throws).
	scores := raw.Scores
	if scores == nil {
		scores = map[string]float64{}
	}
	metadata := raw.Metadata
	if metadata == nil {
		metadata = map[string]any{}
	}
	artifacts := raw.Artifacts
	if artifacts == nil {
		artifacts = []string{}
	}
	logs := raw.Logs
	if logs == nil {
		logs = []string{}
	}

	return &models.StepResult{
		Name:      req.StepName,
		Uses:      req.Uses,
		Status:    status,
		Scores:    scores,
		Passed:    raw.Passed,
		Metadata:  metadata,
		Artifacts: artifacts,
		Logs:      logs,
	}, nil
}

// buildEnv constructs the subprocess environment.
// Inherits server env, then overlays pipeline env vars and Kyklos-specific vars.
func buildEnv(pipelineEnv map[string]string, workspace string, runID string) []string {
	env := os.Environ()
	// Kyklos protocol vars
	env = append(env,
		"KYKLOS_RESULT_FD=3",
		"KYKLOS_WORKSPACE="+workspace,
		"KYKLOS_RUN_ID="+runID,
		// Line-buffered stdout/stderr to pipes so logs appear during long-running steps (not only at exit).
		"PYTHONUNBUFFERED=1",
	)
	// Artifacts dir: KYKLOS_ARTIFACTS_DIR if not already set
	if os.Getenv("KYKLOS_ARTIFACTS_DIR") == "" {
		artifactsDir := defaultArtifactsDir()
		env = append(env, "KYKLOS_ARTIFACTS_DIR="+artifactsDir)
	}
	// Pipeline env overrides
	for k, v := range pipelineEnv {
		env = append(env, k+"="+v)
	}
	return env
}

func defaultArtifactsDir() string {
	if v := os.Getenv("KYKLOS_ARTIFACTS_DIR"); v != "" {
		return v
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "/var/kyklos/artifacts"
	}
	return home + "/.kyklos/artifacts"
}

// stepTimeout returns a sensible default timeout for a step if the context
// doesn't already carry a deadline. Used by callers that want per-step limits.
func stepTimeout() time.Duration {
	return 5 * time.Minute
}
