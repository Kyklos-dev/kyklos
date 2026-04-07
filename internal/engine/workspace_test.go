package engine

import "testing"

func TestURLDirKeyStable(t *testing.T) {
	a := urlDirKey("https://github.com/org/repo.git")
	b := urlDirKey("https://github.com/org/repo.git")
	if a != b {
		t.Fatalf("same URL should yield same key: %q vs %q", a, b)
	}
	if len(a) != 16 {
		t.Fatalf("expected 16 hex chars, got %d (%q)", len(a), a)
	}
}
