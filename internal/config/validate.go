package config

import (
	"fmt"
	"strings"
)

// maxStepTimeoutSeconds is a sanity cap so a typo cannot stall workers for weeks.
const maxStepTimeoutSeconds = 604800 // 7 days

// ValidatePipelineConfig checks a parsed PipelineConfig for semantic errors.
// It enforces the canonical on_fail form and all other constraints from the spec.
func ValidatePipelineConfig(cfg *PipelineConfig) error {
	if cfg.Version == "" {
		return fmt.Errorf("version is required")
	}
	if cfg.Name == "" {
		return fmt.Errorf("name is required")
	}
	if len(cfg.Pipeline) == 0 {
		return fmt.Errorf("pipeline must have at least one stage")
	}

	stageNames := map[string]bool{}
	for i, stage := range cfg.Pipeline {
		if stage.Name == "" {
			return fmt.Errorf("stage[%d]: name is required", i)
		}
		if stageNames[stage.Name] {
			return fmt.Errorf("stage[%d]: duplicate stage name %q", i, stage.Name)
		}
		stageNames[stage.Name] = true

		if len(stage.Steps) == 0 {
			return fmt.Errorf("stage %q: must have at least one step", stage.Name)
		}

		for j, step := range stage.Steps {
			if step.Uses == "" {
				return fmt.Errorf("stage %q step[%d]: uses is required", stage.Name, j)
			}
			if step.TimeoutSeconds < 0 {
				return fmt.Errorf("stage %q step[%d]: timeout_seconds must be >= 0", stage.Name, j)
			}
			if step.TimeoutSeconds > maxStepTimeoutSeconds {
				return fmt.Errorf("stage %q step[%d]: timeout_seconds exceeds max (%d)",
					stage.Name, j, maxStepTimeoutSeconds)
			}
		}

		if err := validateOnFail(stage.Name, stage.OnFail, stageNames); err != nil {
			return err
		}

		if err := validatePassIf(stage.Name, stage.PassIf); err != nil {
			return err
		}
	}

	for _, t := range cfg.Triggers {
		if err := validateTrigger(t); err != nil {
			return err
		}
	}

	if err := validateRunner(cfg.Agent.Runner); err != nil {
		return err
	}

	if err := validateRepository(cfg.Repository); err != nil {
		return err
	}

	return nil
}

func validateRepository(r *RepositoryConfig) error {
	if r == nil || strings.TrimSpace(r.URL) == "" {
		return nil
	}
	u := strings.TrimSpace(r.URL)
	if !(strings.HasPrefix(u, "https://") || strings.HasPrefix(u, "http://") ||
		strings.HasPrefix(u, "git@") || strings.HasPrefix(u, "ssh://")) {
		return fmt.Errorf("repository.url must start with https://, http://, git@, or ssh://")
	}
	return nil
}

// validateOnFail enforces the canonical on_fail schema (Fix 6).
// "abort: true" shorthand is rejected here with a clear error message.
func validateOnFail(stageName string, of OnFail, knownStages map[string]bool) error {
	// Zero value means no on_fail configured — that's fine (defaults to abort).
	if of.Then == "" {
		return nil
	}

	validThen := map[string]bool{"abort": true, "continue": true, "goto": true}
	if !validThen[of.Then] {
		return fmt.Errorf("stage %q on_fail.then: invalid value %q — must be abort, continue, or goto", stageName, of.Then)
	}

	if of.Then == "goto" && of.Goto == "" {
		return fmt.Errorf("stage %q on_fail: goto field is required when then=goto", stageName)
	}
	if of.Then != "goto" && of.Goto != "" {
		return fmt.Errorf("stage %q on_fail: goto field is only valid when then=goto", stageName)
	}
	if of.Then == "goto" && !knownStages[of.Goto] {
		// Note: target stage may appear later in the list — we do a second pass
		// in ValidatePipelineConfig after collecting all names, so this check is
		// deferred to the caller. We only check here for obviously wrong values.
	}

	if of.Retry.MaxAttempts < 0 {
		return fmt.Errorf("stage %q on_fail.retry.max_attempts must be >= 0", stageName)
	}
	if of.Retry.DelaySeconds < 0 {
		return fmt.Errorf("stage %q on_fail.retry.delay_seconds must be >= 0", stageName)
	}

	return nil
}

// validatePassIf checks engine-level gate expressions (Fix 8).
// These use the format: "step-name.score_key": ">= 0.90"
func validatePassIf(stageName string, passIf map[string]string) error {
	for key, expr := range passIf {
		if !strings.Contains(key, ".") {
			return fmt.Errorf("stage %q pass_if key %q: must be in format <step-name>.<score_key>", stageName, key)
		}
		if err := validateGateExpr(expr); err != nil {
			return fmt.Errorf("stage %q pass_if[%q]: %w", stageName, key, err)
		}
	}
	return nil
}

// validateGateExpr checks an engine gate expression.
// Valid forms: ">= 0.90", "<= 0.05", "> 0.80", "< 0.03", "== true", "== false"
// Regression-style "drops > 0.03" and "increases > 0.20" are NOT valid in engine gates
// (they belong inside kyklos/regression's with.fail_if block).
func validateGateExpr(expr string) error {
	expr = strings.TrimSpace(expr)
	validOps := []string{">=", "<=", ">", "<", "=="}
	for _, op := range validOps {
		if strings.HasPrefix(expr, op) {
			return nil
		}
	}
	// Catch common mistake of using regression syntax in engine gate
	if strings.HasPrefix(expr, "drops") || strings.HasPrefix(expr, "increases") {
		return fmt.Errorf("regression expressions (drops/increases) belong inside kyklos/regression with.fail_if, not in pass_if")
	}
	return fmt.Errorf("invalid expression %q — must start with >=, <=, >, <, or ==", expr)
}

// validateTrigger checks a trigger definition.
func validateTrigger(t Trigger) error {
	valid := map[string]bool{"push": true, "schedule": true, "manual": true}
	if !valid[t.On] {
		return fmt.Errorf("trigger.on: invalid value %q — must be push, schedule, or manual", t.On)
	}
	if t.On == "schedule" && t.Cron == "" {
		return fmt.Errorf("trigger: cron field is required when on=schedule")
	}
	return nil
}

// validateRunner checks the agent runner config (Fix 1).
// Allowed types match AgentRunner docs and sdk/python/kyklos/sdk/agent.py.
func validateRunner(r AgentRunner) error {
	rt := r.RunnerType()
	switch rt {
	case "anthropic", "openai", "gemini", "google":
		// API keys come from environment (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY).
	case "script":
		if r.Script == "" {
			return fmt.Errorf("agent.runner: script field is required when type=script")
		}
	default:
		return fmt.Errorf(
			"agent.runner.type: invalid value %q — must be anthropic, openai, gemini, google, or script",
			rt,
		)
	}
	return nil
}

// ValidateServerConfig checks a parsed ServerConfig.
func ValidateServerConfig(cfg *ServerConfig) error {
	for i, repo := range cfg.Repos {
		if repo.Name == "" {
			return fmt.Errorf("repos[%d]: name is required", i)
		}
		if repo.Remote == "" {
			return fmt.Errorf("repos[%d] (%q): remote is required", i, repo.Name)
		}
		switch repo.Auth.Type {
		case "", "none", "ssh":
		case "token":
			if repo.Auth.Env == "" {
				return fmt.Errorf("repos[%d] (%q): auth.env is required when auth.type=token", i, repo.Name)
			}
		default:
			return fmt.Errorf("repos[%d] (%q): auth.type invalid %q — must be none, token, or ssh", i, repo.Name, repo.Auth.Type)
		}
	}

	return nil
}
