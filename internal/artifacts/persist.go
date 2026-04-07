// Package artifacts copies step artifact files into durable storage under artifactRoot.
package artifacts

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

// Pending is metadata after a successful copy; the engine inserts it into the store.
type Pending struct {
	ID          string
	LogicalName string
	StoragePath string
	SizeBytes   int64
}

// PersistFiles copies each path that exists as a regular file into
// artifactRoot/runID/<uuid>_<basename>. Paths may be absolute or relative to workspace.
func PersistFiles(artifactRoot, runID, workspace string, paths []string) ([]Pending, error) {
	if artifactRoot == "" || runID == "" {
		return nil, nil
	}
	destDir := filepath.Join(artifactRoot, runID)
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return nil, fmt.Errorf("mkdir artifact store: %w", err)
	}

	var out []Pending
	for _, p := range paths {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if !filepath.IsAbs(p) {
			p = filepath.Join(workspace, p)
		}
		p = filepath.Clean(p)
		st, err := os.Stat(p)
		if err != nil || !st.Mode().IsRegular() {
			continue
		}
		base := filepath.Base(p)
		if base == "." || base == "/" {
			base = "artifact"
		}
		id := uuid.NewString()
		dest := filepath.Join(destDir, id+"_"+base)

		srcF, err := os.Open(p)
		if err != nil {
			continue
		}
		dstF, err := os.Create(dest)
		if err != nil {
			srcF.Close()
			continue
		}
		n, copyErr := io.Copy(dstF, srcF)
		srcF.Close()
		dstF.Close()
		if copyErr != nil {
			_ = os.Remove(dest)
			continue
		}
		out = append(out, Pending{
			ID:          id,
			LogicalName: base,
			StoragePath: dest,
			SizeBytes:   n,
		})
	}
	return out, nil
}
