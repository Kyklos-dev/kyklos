package gitbranches

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"sort"
	"strings"
)

// ListHeads returns remote branch names (without refs/heads/ prefix) for a public clone URL.
func ListHeads(ctx context.Context, remoteURL string) ([]string, error) {
	remoteURL = strings.TrimSpace(remoteURL)
	if remoteURL == "" {
		return nil, fmt.Errorf("empty remote URL")
	}
	cmd := exec.CommandContext(ctx, "git", "ls-remote", "--heads", remoteURL)
	out, err := cmd.Output()
	if err != nil {
		if x, ok := err.(*exec.ExitError); ok && len(x.Stderr) > 0 {
			return nil, fmt.Errorf("git ls-remote: %w\n%s", err, string(x.Stderr))
		}
		return nil, fmt.Errorf("git ls-remote: %w", err)
	}

	seen := map[string]struct{}{}
	sc := bufio.NewScanner(strings.NewReader(string(out)))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		ref := parts[1]
		const prefix = "refs/heads/"
		if !strings.HasPrefix(ref, prefix) {
			continue
		}
		name := strings.TrimPrefix(ref, prefix)
		if name != "" {
			seen[name] = struct{}{}
		}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}

	names := make([]string, 0, len(seen))
	for n := range seen {
		names = append(names, n)
	}
	sort.Slice(names, func(i, j int) bool {
		pi, pj := priority(names[i]), priority(names[j])
		if pi != pj {
			return pi < pj
		}
		return names[i] < names[j]
	})
	return names, nil
}

func priority(branch string) int {
	switch strings.ToLower(branch) {
	case "main":
		return 0
	case "master":
		return 1
	default:
		return 2
	}
}
