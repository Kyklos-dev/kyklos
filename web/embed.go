// Package web embeds the pre-built React dashboard so it can be served
// directly from the kyklos binary without any external files.
package web

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"
)

//go:embed all:dist
var distFS embed.FS

// Handler returns an http.Handler that serves the React SPA.
// Unknown paths fall back to index.html for client-side routing.
func Handler() http.Handler {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic("web: failed to sub dist: " + err.Error())
	}
	fsys := http.FS(sub)
	fileServer := http.FileServer(fsys)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// embed.FS paths must not have a leading slash.
		clean := strings.TrimPrefix(r.URL.Path, "/")
		if clean == "" {
			clean = "."
		}
		f, err := sub.Open(clean)
		if err == nil {
			f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}
		// Unknown path — fall back to index.html so React Router handles it.
		r2 := r.Clone(r.Context())
		r2.URL.Path = "/"
		fileServer.ServeHTTP(w, r2)
	})
}
