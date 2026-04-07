package engine

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/kyklos/kyklos/internal/config"
)

// ParsePipelineFile reads and validates a kyklos.yaml file from disk.
// The workspaceRoot is the repo root — it's used to resolve relative paths
// (e.g. ./prompts/system.md) in the config and to validate that referenced
// files actually exist.
func ParsePipelineFile(yamlPath, workspaceRoot string) (*config.PipelineConfig, error) {
	data, err := os.ReadFile(yamlPath)
	if err != nil {
		return nil, fmt.Errorf("read %q: %w", yamlPath, err)
	}
	return ParsePipelineBytes(data, workspaceRoot)
}

// ParsePipelineBytes parses and validates kyklos.yaml content from a byte slice.
// workspaceRoot may be empty when called outside of a real workspace (e.g. tests).
func ParsePipelineBytes(data []byte, workspaceRoot string) (*config.PipelineConfig, error) {
	// Detect and reject legacy "gate:" key before YAML unmarshalling so we can
	// give a clear error rather than silently ignoring it.
	if err := rejectLegacyKeys(data); err != nil {
		return nil, err
	}

	var cfg config.PipelineConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse yaml: %w", err)
	}

	// Semantic validation
	if err := config.ValidatePipelineConfig(&cfg); err != nil {
		return nil, fmt.Errorf("invalid pipeline config: %w", err)
	}

	// Validate goto targets now that we have the full stage list
	if err := validateGotoTargets(&cfg); err != nil {
		return nil, err
	}

	// Resolve and validate relative file paths when we have a workspace
	if workspaceRoot != "" {
		if err := resolveFilePaths(&cfg, workspaceRoot); err != nil {
			return nil, err
		}
	}

	// Expand env var references in env block
	expandEnvVars(&cfg)

	return &cfg, nil
}

// rejectLegacyKeys scans raw YAML bytes for keys that have been renamed.
// This gives users a clear migration message instead of silently ignoring them.
func rejectLegacyKeys(data []byte) error {
	lines := strings.Split(string(data), "\n")
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		// "gate:" at any indentation level was the old name for pass_if:
		if trimmed == "gate:" || strings.HasPrefix(trimmed, "gate:") {
			return fmt.Errorf("line %d: 'gate:' has been renamed to 'pass_if:' — please update your kyklos.yaml", i+1)
		}
		// "abort: true" shorthand inside on_fail
		if trimmed == "abort: true" {
			return fmt.Errorf("line %d: 'abort: true' is not valid — use 'then: abort' inside on_fail", i+1)
		}
	}
	return nil
}

// validateGotoTargets ensures every on_fail.goto references a real stage name.
func validateGotoTargets(cfg *config.PipelineConfig) error {
	names := map[string]bool{}
	for _, s := range cfg.Pipeline {
		names[s.Name] = true
	}
	for _, s := range cfg.Pipeline {
		if s.OnFail.Then == "goto" && !names[s.OnFail.Goto] {
			return fmt.Errorf("stage %q on_fail.goto: target stage %q does not exist", s.Name, s.OnFail.Goto)
		}
	}
	return nil
}

// resolveFilePaths converts relative paths in the config to absolute paths
// rooted at workspaceRoot, and checks that required files actually exist.
func resolveFilePaths(cfg *config.PipelineConfig, workspaceRoot string) error {
	abs := func(p string) string {
		if p == "" || filepath.IsAbs(p) {
			return p
		}
		return filepath.Join(workspaceRoot, p)
	}

	// Agent prompt
	if cfg.Agent.Prompt != "" {
		cfg.Agent.Prompt = abs(cfg.Agent.Prompt)
		if _, err := os.Stat(cfg.Agent.Prompt); err != nil {
			return fmt.Errorf("agent.prompt: file not found: %s", cfg.Agent.Prompt)
		}
	}

	// Script runner
	if cfg.Agent.Runner.RunnerType() == "script" {
		cfg.Agent.Runner.Script = abs(cfg.Agent.Runner.Script)
		if _, err := os.Stat(cfg.Agent.Runner.Script); err != nil {
			return fmt.Errorf("agent.runner.script: file not found: %s", cfg.Agent.Runner.Script)
		}
	}

	// Eval bundle artifact paths (optional)
	if cfg.EvalBundle != nil {
		eb := cfg.EvalBundle
		check := func(field, p string) error {
			if p == "" {
				return nil
			}
			ap := abs(p)
			if _, err := os.Stat(ap); err != nil {
				return fmt.Errorf("eval_bundle.%s: file not found: %s", field, ap)
			}
			return nil
		}
		if err := check("prompt", eb.Prompt); err != nil {
			return err
		}
		if err := check("dataset", eb.Dataset); err != nil {
			return err
		}
		if err := check("rubric", eb.Rubric); err != nil {
			return err
		}
		if err := check("schema", eb.Schema); err != nil {
			return err
		}
	}

	// Resolve local step paths (./foo.py)
	for si := range cfg.Pipeline {
		for si2 := range cfg.Pipeline[si].Steps {
			uses := cfg.Pipeline[si].Steps[si2].Uses
			if strings.HasPrefix(uses, "./") || strings.HasPrefix(uses, "../") {
				abs := filepath.Join(workspaceRoot, uses)
				if _, err := os.Stat(abs); err != nil {
					return fmt.Errorf("stage %q step %q: local step file not found: %s",
						cfg.Pipeline[si].Name, uses, abs)
				}
				cfg.Pipeline[si].Steps[si2].Uses = abs
			}
		}
	}

	return nil
}

// expandEnvVars replaces $VAR_NAME references in the env block with their values.
// References that resolve to empty string remain as-is so the engine can detect them.
func expandEnvVars(cfg *config.PipelineConfig) {
	for k, v := range cfg.Env {
		if strings.HasPrefix(v, "$") {
			envKey := strings.TrimPrefix(v, "$")
			if val := os.Getenv(envKey); val != "" {
				cfg.Env[k] = val
			}
		}
	}
}
