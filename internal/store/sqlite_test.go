package store

import (
	"context"
	"os"
	"testing"

	"github.com/kyklos/kyklos/internal/models"
)

func newTestStore(t *testing.T) *SQLiteStore {
	t.Helper()
	f, err := os.CreateTemp("", "kyklos-test-*.db")
	if err != nil {
		t.Fatal(err)
	}
	f.Close()
	t.Cleanup(func() { os.Remove(f.Name()) })

	st, err := NewSQLite(f.Name())
	if err != nil {
		t.Fatalf("NewSQLite: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	return st
}

func TestPipelineCRUD(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()

	p := &models.Pipeline{
		Name:     "my-agent",
		RepoName: "test-repo",
		YAMLPath: "kyklos.yaml",
	}
	if err := st.CreatePipeline(ctx, p); err != nil {
		t.Fatalf("CreatePipeline: %v", err)
	}
	if p.ID == "" {
		t.Fatal("ID not assigned")
	}

	got, err := st.GetPipeline(ctx, p.ID)
	if err != nil {
		t.Fatalf("GetPipeline: %v", err)
	}
	if got.Name != p.Name {
		t.Errorf("name: got %q, want %q", got.Name, p.Name)
	}

	list, err := st.ListPipelines(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 {
		t.Errorf("list len: got %d, want 1", len(list))
	}

	p.Name = "updated"
	if err := st.UpdatePipeline(ctx, p); err != nil {
		t.Fatalf("UpdatePipeline: %v", err)
	}
	got, _ = st.GetPipeline(ctx, p.ID)
	if got.Name != "updated" {
		t.Errorf("updated name: got %q", got.Name)
	}

	if err := st.DeletePipeline(ctx, p.ID); err != nil {
		t.Fatalf("DeletePipeline: %v", err)
	}
	list, _ = st.ListPipelines(ctx)
	if len(list) != 0 {
		t.Errorf("after delete: expected 0, got %d", len(list))
	}
}

func TestDeletePipelineWithRunsCascade(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()

	p := &models.Pipeline{Name: "with-runs"}
	if err := st.CreatePipeline(ctx, p); err != nil {
		t.Fatalf("CreatePipeline: %v", err)
	}
	r := &models.Run{PipelineID: p.ID, Trigger: models.TriggerManual}
	if err := st.CreateRun(ctx, r); err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	if err := st.DeletePipeline(ctx, p.ID); err != nil {
		t.Fatalf("DeletePipeline with runs: %v", err)
	}
	list, _ := st.ListPipelines(ctx)
	if len(list) != 0 {
		t.Errorf("pipelines after cascade delete: got %d", len(list))
	}
	runs, err := st.ListRuns(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != 0 {
		t.Errorf("runs after cascade delete: got %d", len(runs))
	}
}

func TestRunLifecycle(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()

	p := &models.Pipeline{Name: "p"}
	_ = st.CreatePipeline(ctx, p)

	r := &models.Run{
		PipelineID: p.ID,
		Trigger:    models.TriggerManual,
	}
	if err := st.CreateRun(ctx, r); err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	if r.Status != models.RunStatusPending {
		t.Errorf("initial status: %s", r.Status)
	}

	_ = st.StartRun(ctx, r.ID)
	got, _ := st.GetRun(ctx, r.ID)
	if got.Status != models.RunStatusRunning {
		t.Errorf("after start: %s", got.Status)
	}
	if got.StartedAt == nil {
		t.Error("started_at not set")
	}

	_ = st.FinishRun(ctx, r.ID, models.RunStatusPassed, "")
	got, _ = st.GetRun(ctx, r.ID)
	if got.Status != models.RunStatusPassed {
		t.Errorf("after finish: %s", got.Status)
	}
	if got.FinishedAt == nil {
		t.Error("finished_at not set")
	}
}

func TestStageResultsAndLogs(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()

	p := &models.Pipeline{Name: "p"}
	_ = st.CreatePipeline(ctx, p)
	r := &models.Run{PipelineID: p.ID, Trigger: models.TriggerManual}
	_ = st.CreateRun(ctx, r)

	sr := &models.StageResult{
		RunID:     r.ID,
		StageName: "evaluate",
		Iteration: 1,
		Status:    models.StageStatusPassed,
		Steps: []models.StepResult{
			{Name: "llm-judge", Uses: "kyklos/llm-judge", Status: models.StageStatusPassed,
				Scores: map[string]float64{"score": 0.91}, Passed: true},
		},
	}
	if err := st.SaveStageResult(ctx, sr); err != nil {
		t.Fatalf("SaveStageResult: %v", err)
	}

	results, err := st.GetStageResults(ctx, r.ID)
	if err != nil {
		t.Fatalf("GetStageResults: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("got %d results, want 1", len(results))
	}
	if results[0].Steps[0].Scores["score"] != 0.91 {
		t.Errorf("score: got %v", results[0].Steps[0].Scores["score"])
	}

	_ = st.AppendLog(ctx, &models.LogEntry{RunID: r.ID, StageName: "evaluate", Line: "hello"})
	_ = st.AppendLog(ctx, &models.LogEntry{RunID: r.ID, StageName: "evaluate", Line: "world"})

	logs, err := st.GetLogs(ctx, r.ID)
	if err != nil {
		t.Fatalf("GetLogs: %v", err)
	}
	if len(logs) != 2 {
		t.Errorf("logs: got %d, want 2", len(logs))
	}
}

func TestSetPipelineBaseline(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()

	p := &models.Pipeline{Name: "p"}
	if err := st.CreatePipeline(ctx, p); err != nil {
		t.Fatalf("CreatePipeline: %v", err)
	}
	r := &models.Run{PipelineID: p.ID, Trigger: models.TriggerManual}
	if err := st.CreateRun(ctx, r); err != nil {
		t.Fatalf("CreateRun: %v", err)
	}

	if err := st.SetPipelineBaseline(ctx, p.ID, r.ID); err != nil {
		t.Fatalf("SetPipelineBaseline: %v", err)
	}
	got, _ := st.GetPipeline(ctx, p.ID)
	if got.BaselineRunID != r.ID {
		t.Errorf("baseline: got %q, want %q", got.BaselineRunID, r.ID)
	}

	if err := st.SetPipelineBaseline(ctx, p.ID, ""); err != nil {
		t.Fatalf("clear baseline: %v", err)
	}
	got, _ = st.GetPipeline(ctx, p.ID)
	if got.BaselineRunID != "" {
		t.Errorf("after clear: got %q, want empty", got.BaselineRunID)
	}

	if err := st.SetPipelineBaseline(ctx, p.ID, "00000000-0000-0000-0000-000000000000"); err == nil {
		t.Fatal("expected error for missing run")
	}
}

func TestListRunsAll(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()

	p := &models.Pipeline{Name: "alpha", RepoName: "repo-a"}
	_ = st.CreatePipeline(ctx, p)
	r := &models.Run{PipelineID: p.ID, Trigger: models.TriggerManual, GitBranch: "main"}
	_ = st.CreateRun(ctx, r)

	all, err := st.ListRunsAll(ctx, ListRunsFilter{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 1 {
		t.Fatalf("len: %d", len(all))
	}
	if all[0].PipelineName != "alpha" || all[0].PipelineRepoName != "repo-a" {
		t.Fatalf("pipeline meta: %+v", all[0])
	}

	filtered, _ := st.ListRunsAll(ctx, ListRunsFilter{Status: string(models.RunStatusPending), Limit: 10})
	if len(filtered) != 1 {
		t.Fatalf("status filter: %d", len(filtered))
	}
}

func TestGlobalEnvRoundTrip(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()

	got, err := st.GetGlobalEnv(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("empty db: want no keys, got %v", got)
	}

	in := map[string]string{"GEMINI_API_KEY": "secret", "FOO": "bar"}
	if err := st.SetGlobalEnv(ctx, in); err != nil {
		t.Fatal(err)
	}
	got, err = st.GetGlobalEnv(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got["GEMINI_API_KEY"] != "secret" || got["FOO"] != "bar" || len(got) != 2 {
		t.Fatalf("GetGlobalEnv: %+v", got)
	}

	if err := st.SetGlobalEnv(ctx, map[string]string{}); err != nil {
		t.Fatal(err)
	}
	got, _ = st.GetGlobalEnv(ctx)
	if len(got) != 0 {
		t.Fatalf("cleared: want empty, got %v", got)
	}
}

func TestWorkspaceAndPipelineLink(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()

	w := &models.Workspace{Name: "demo", RepoURL: "https://example.com/a.git", DefaultBranch: "main", Branches: []string{"main", "dev"}}
	if err := st.CreateWorkspace(ctx, w); err != nil {
		t.Fatal(err)
	}
	if w.ID == "" {
		t.Fatal("workspace id")
	}

	p := &models.Pipeline{Name: "p1", WorkspaceID: w.ID, RepoName: "", YAMLPath: "kyklos.yaml"}
	p.Config.Version = "1.0"
	p.Config.Name = "p1"
	if err := st.CreatePipeline(ctx, p); err != nil {
		t.Fatal(err)
	}

	n, err := st.CountPipelinesInWorkspace(ctx, w.ID)
	if err != nil || n != 1 {
		t.Fatalf("count: %d %v", n, err)
	}

	list, err := st.ListPipelinesByWorkspace(ctx, w.ID)
	if err != nil || len(list) != 1 || list[0].WorkspaceID != w.ID {
		t.Fatalf("ListPipelinesByWorkspace: %+v err=%v", list, err)
	}

	if err := st.DeleteWorkspace(ctx, w.ID); err != nil {
		t.Fatal(err)
	}
	// pipeline still exists (no FK cascade by design)
	got, _ := st.GetPipeline(ctx, p.ID)
	if got == nil || got.WorkspaceID != w.ID {
		t.Fatalf("pipeline after ws delete: %+v", got)
	}
}
