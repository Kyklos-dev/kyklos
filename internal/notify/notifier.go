// Package notify delivers pipeline run outcomes to external channels.
// Phase 3 ships a log-based default. Slack is wired up in Phase 5.
package notify

import (
	"context"
	"log/slog"

	"github.com/kyklos/kyklos/internal/models"
)

// Notifier sends pipeline run events to one or more channels.
type Notifier interface {
	Notify(ctx context.Context, pipelineName string, run *models.Run, event string)
}

// LogNotifier writes events to slog. Used by default and as a fallback.
type LogNotifier struct{}

func (n *LogNotifier) Notify(_ context.Context, pipelineName string, run *models.Run, event string) {
	slog.Info("pipeline run event",
		"pipeline", pipelineName,
		"run_id", run.ID,
		"status", run.Status,
		"event", event,
	)
}

// Multi fans out to multiple Notifiers.
type Multi struct {
	notifiers []Notifier
}

func NewMulti(nn ...Notifier) *Multi { return &Multi{notifiers: nn} }

func (m *Multi) Notify(ctx context.Context, pipelineName string, run *models.Run, event string) {
	for _, n := range m.notifiers {
		n.Notify(ctx, pipelineName, run, event)
	}
}
