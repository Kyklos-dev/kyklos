package engine

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/kyklos/kyklos/internal/models"
)

// GateEvaluator evaluates engine-level pass_if conditions (Fix 8).
// These are distinct from step-internal fail_if assertions (e.g. in kyklos/regression).
type GateEvaluator struct{}

// Check evaluates all pass_if conditions against the steps that ran in a stage.
// Returns the per-condition results and an overall pass/fail bool.
//
// passIf keys use the format "<step-name>.<score-key>" (e.g. "llm-judge.score").
// The special key "<step-name>.passed" checks the step's boolean Passed field.
func (g *GateEvaluator) Check(
	passIf map[string]string,
	stepResults []models.StepResult,
) ([]models.GateResult, bool) {
	if len(passIf) == 0 {
		return nil, true
	}

	// Index step results by name for O(1) lookup
	byName := make(map[string]*models.StepResult, len(stepResults))
	for i := range stepResults {
		byName[stepResults[i].Name] = &stepResults[i]
	}

	var results []models.GateResult
	allPassed := true

	for key, expr := range passIf {
		result := g.evaluateCondition(key, expr, byName)
		results = append(results, result)
		if !result.Passed {
			allPassed = false
		}
	}

	return results, allPassed
}

func (g *GateEvaluator) evaluateCondition(
	key, expr string,
	byName map[string]*models.StepResult,
) models.GateResult {
	gr := models.GateResult{Key: key, Expr: expr}

	// Parse "step-name.score-key"
	dot := strings.LastIndex(key, ".")
	if dot < 0 {
		gr.Passed = false
		return gr
	}
	stepName, scoreKey := key[:dot], key[dot+1:]

	step, ok := byName[stepName]
	if !ok {
		// Step didn't run — gate fails
		gr.Passed = false
		return gr
	}

	// Resolve the value to check
	var numVal float64
	var isBool bool

	if scoreKey == "passed" {
		// Special case: .passed maps to the step's boolean Passed field
		if step.Passed {
			numVal = 1.0
		} else {
			numVal = 0.0
		}
		isBool = true
	} else {
		v, exists := step.Scores[scoreKey]
		if !exists {
			gr.Passed = false
			return gr
		}
		numVal = v
	}

	gr.Value = numVal
	gr.Passed = evaluate(numVal, expr, isBool)
	return gr
}

// evaluate applies a gate expression to a numeric value.
//
// Supported expressions:
//
//	">= 0.90"   — numeric greater-than-or-equal
//	"<= 0.05"   — numeric less-than-or-equal
//	"> 0.80"    — numeric greater-than
//	"< 0.03"    — numeric less-than
//	"== true"   — boolean true (value == 1.0)
//	"== false"  — boolean false (value == 0.0)
//	"== 0.90"   — numeric equality
func evaluate(value float64, expr string, isBool bool) bool {
	expr = strings.TrimSpace(expr)

	// Boolean expressions
	if expr == "== true" {
		return value == 1.0
	}
	if expr == "== false" {
		return value == 0.0
	}

	// Numeric expressions: split into operator and threshold
	op, threshStr, err := parseExpr(expr)
	if err != nil {
		return false
	}
	thresh, err := strconv.ParseFloat(threshStr, 64)
	if err != nil {
		return false
	}

	switch op {
	case ">=":
		return value >= thresh
	case "<=":
		return value <= thresh
	case ">":
		return value > thresh
	case "<":
		return value < thresh
	case "==":
		return value == thresh
	default:
		return false
	}
}

// parseExpr splits a gate expression like ">= 0.90" into (">=", "0.90", nil).
func parseExpr(expr string) (op, value string, err error) {
	for _, candidate := range []string{">=", "<=", ">", "<", "=="} {
		if strings.HasPrefix(expr, candidate) {
			rest := strings.TrimSpace(expr[len(candidate):])
			return candidate, rest, nil
		}
	}
	return "", "", fmt.Errorf("unrecognised gate expression: %q", expr)
}

// FormatGateFailure builds a human-readable message for a failed gate.
func FormatGateFailure(results []models.GateResult) string {
	var lines []string
	for _, r := range results {
		if !r.Passed {
			lines = append(lines, fmt.Sprintf("  %s: got %.4g, wanted %s", r.Key, r.Value, r.Expr))
		}
	}
	return strings.Join(lines, "\n")
}
