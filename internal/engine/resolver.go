package engine

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// builtinSteps maps "kyklos/<name>" to its path under the steps directory.
// The path is relative to the stepsDir root.
var builtinSteps = map[string]string{
	// Build
	"kyklos/snapshot": "build/snapshot.py",
	"kyklos/lint":     "build/lint.py",
	"kyklos/diff":     "build/diff.py",

	// Test
	"kyklos/run-dataset":           "test/run_dataset.py",
	"kyklos/simulate-conversation": "test/simulate_conversation.py",
	"kyklos/check-tool-calls":      "test/check_tool_calls.py",
	"kyklos/wait":                  "test/wait.py",

	// Evaluate
	"kyklos/llm-judge":           "evaluate/llm_judge.py",
	"kyklos/exact-match":         "evaluate/exact_match.py",
	"kyklos/semantic-similarity": "evaluate/semantic_similarity.py",
	"kyklos/safety-check":        "evaluate/safety_check.py",
	"kyklos/cost-check":          "evaluate/cost_check.py",
	"kyklos/latency-check":       "evaluate/latency_check.py",
	"kyklos/regression":          "evaluate/regression.py",
	"kyklos/json-schema":         "evaluate/json_schema.py",
	"kyklos/http-judge":          "evaluate/http_judge.py",

	// Register
	"kyklos/tag":  "register/tag.py",
	"kyklos/push": "register/push.py",

	// Deploy
	"kyklos/deploy-endpoint": "deploy/deploy_endpoint.py",
	"kyklos/canary":          "deploy/canary.py",
	"kyklos/health-check":    "deploy/health_check.py",
}

// Resolver maps step import strings to absolute file paths.
type Resolver struct {
	stepsDir   string // where built-in steps live (KYKLOS_STEPS_DIR)
	pythonBin  string // Python interpreter for package resolution
	workspace  string // agent repo root (for relative path steps)
}

// NewResolver creates a Resolver. workspace may be empty at server startup;
// it must be set before resolving local steps.
func NewResolver(stepsDir, pythonBin, workspace string) *Resolver {
	if stepsDir == "" {
		stepsDir = defaultStepsDir()
	}
	if pythonBin == "" {
		pythonBin = "python3"
	}
	return &Resolver{stepsDir: stepsDir, pythonBin: pythonBin, workspace: workspace}
}

// WithWorkspace returns a copy of the resolver with a different workspace root.
// Used to create a per-run resolver from the shared server-level resolver.
func (r *Resolver) WithWorkspace(workspace string) *Resolver {
	return &Resolver{
		stepsDir:  r.stepsDir,
		pythonBin: r.pythonBin,
		workspace: workspace,
	}
}

// Resolve converts a step's uses string to an absolute path to a Python file.
//
// Three forms are supported:
//
//  1. Built-in:  "kyklos/llm-judge"   → {stepsDir}/evaluate/llm_judge.py
//  2. Local:     "./my_step.py"        → {workspace}/my_step.py  (already abs after parsing)
//  3. Package:   "braintrust"          → entry point discovered via Python
func (r *Resolver) Resolve(uses string) (string, error) {
	switch {
	case strings.HasPrefix(uses, "kyklos/"):
		return r.resolveBuiltin(uses)
	case filepath.IsAbs(uses):
		// Already resolved by parser (local ./ paths become absolute)
		return r.resolveAbs(uses)
	case strings.HasPrefix(uses, "./") || strings.HasPrefix(uses, "../"):
		// Shouldn't reach here after parsing, but handle defensively
		return r.resolveLocal(uses)
	default:
		return r.resolvePackage(uses)
	}
}

func (r *Resolver) resolveBuiltin(uses string) (string, error) {
	rel, ok := builtinSteps[uses]
	if !ok {
		return "", fmt.Errorf("unknown built-in step %q — valid steps: %s",
			uses, knownBuiltins())
	}
	abs := filepath.Join(r.stepsDir, rel)
	if err := checkFile(abs); err != nil {
		return "", fmt.Errorf("built-in step %q: %w", uses, err)
	}
	return abs, nil
}

func (r *Resolver) resolveAbs(path string) (string, error) {
	if err := checkFile(path); err != nil {
		return "", fmt.Errorf("step file not found: %s", path)
	}
	return path, nil
}

func (r *Resolver) resolveLocal(rel string) (string, error) {
	if r.workspace == "" {
		return "", fmt.Errorf("cannot resolve local step %q: workspace not set", rel)
	}
	abs := filepath.Join(r.workspace, rel)
	if err := checkFile(abs); err != nil {
		return "", fmt.Errorf("local step %q not found at %s", rel, abs)
	}
	return abs, nil
}

// resolvePackage finds a Kyklos-compatible step exported by an installed Python
// package. The package must expose an entry point named "kyklos_<name>".
// e.g. package "braintrust" → looks for entry point group "kyklos.steps", name "braintrust"
func (r *Resolver) resolvePackage(name string) (string, error) {
	// Ask Python to locate the entry point and print the file path
	script := fmt.Sprintf(`
import importlib.metadata, sys
try:
    eps = importlib.metadata.entry_points(group="kyklos.steps")
    ep = next((e for e in eps if e.name == %q), None)
    if ep is None:
        print("NOT_FOUND", end="")
    else:
        import importlib, inspect, pathlib
        mod = importlib.import_module(ep.value.split(":")[0])
        print(pathlib.Path(inspect.getfile(mod)).as_posix(), end="")
except Exception as e:
    print(f"ERROR:{e}", end="")
`, name)

	out, err := exec.Command(r.pythonBin, "-c", script).Output()
	if err != nil {
		return "", fmt.Errorf("package step resolution for %q failed: %w", name, err)
	}
	result := string(out)
	switch {
	case result == "NOT_FOUND":
		return "", fmt.Errorf(
			"package step %q not found — install it with: pip install kyklos-%s", name, name,
		)
	case strings.HasPrefix(result, "ERROR:"):
		return "", fmt.Errorf("package step resolution error for %q: %s", name, strings.TrimPrefix(result, "ERROR:"))
	}
	return result, nil
}

// checkFile returns an error if path does not exist or is not a regular file.
func checkFile(path string) error {
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return fmt.Errorf("file not found: %s", path)
	}
	if err != nil {
		return err
	}
	if info.IsDir() {
		return fmt.Errorf("%s is a directory, not a Python file", path)
	}
	return nil
}

// defaultStepsDir returns the default location of built-in steps.
// Precedence: KYKLOS_STEPS_DIR env → executable-relative → /usr/local/lib/kyklos/steps.
func defaultStepsDir() string {
	if v := os.Getenv("KYKLOS_STEPS_DIR"); v != "" {
		return v
	}
	// Try relative to the executable (for development / single-binary use)
	if exe, err := os.Executable(); err == nil {
		candidate := filepath.Join(filepath.Dir(exe), "steps")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return "/usr/local/lib/kyklos/steps"
}

// knownBuiltins returns a sorted comma-separated list of valid kyklos/* steps.
func knownBuiltins() string {
	names := make([]string, 0, len(builtinSteps))
	for k := range builtinSteps {
		names = append(names, k)
	}
	return strings.Join(names, ", ")
}
