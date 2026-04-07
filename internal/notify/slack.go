package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/kyklos/kyklos/internal/models"
)

// SlackNotifier posts pipeline run events to a Slack webhook.
type SlackNotifier struct {
	webhookURL string
	client     *http.Client
}

// NewSlackNotifier creates a SlackNotifier.
// webhookURL may be a literal URL or an env var reference like "$SLACK_WEBHOOK".
// Returns nil (not an error) when the URL is empty — callers should check.
func NewSlackNotifier(webhookURL string) *SlackNotifier {
	if webhookURL == "" {
		return nil
	}
	// Resolve env var reference
	if len(webhookURL) > 1 && webhookURL[0] == '$' {
		webhookURL = os.Getenv(webhookURL[1:])
		if webhookURL == "" {
			return nil
		}
	}
	return &SlackNotifier{
		webhookURL: webhookURL,
		client:     &http.Client{Timeout: 5 * time.Second},
	}
}

func (s *SlackNotifier) Notify(ctx context.Context, pipelineName string, run *models.Run, event string) {
	emoji, color := eventStyle(event)
	text := fmt.Sprintf("%s *%s* pipeline run `%s` — *%s*",
		emoji, pipelineName, run.ID[:8], event)

	var duration string
	if run.StartedAt != nil && run.FinishedAt != nil {
		duration = run.FinishedAt.Sub(*run.StartedAt).Round(time.Second).String()
	}

	payload := map[string]any{
		"attachments": []map[string]any{
			{
				"color": color,
				"blocks": []map[string]any{
					{
						"type": "section",
						"text": map[string]string{"type": "mrkdwn", "text": text},
					},
					{
						"type": "context",
						"elements": []map[string]string{
							{"type": "mrkdwn", "text": fmt.Sprintf("trigger: `%s`", run.Trigger)},
							{"type": "mrkdwn", "text": fmt.Sprintf("branch: `%s`", run.GitBranch)},
							{"type": "mrkdwn", "text": fmt.Sprintf("duration: `%s`", duration)},
						},
					},
				},
			},
		},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.webhookURL, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil || resp == nil {
		return
	}
	resp.Body.Close()
}

func eventStyle(event string) (emoji, color string) {
	switch event {
	case "success":
		return "✅", "good"
	case "failure":
		return "❌", "danger"
	default:
		return "ℹ️", "#cccccc"
	}
}
