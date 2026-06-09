package server

import (
	"net/http"

	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/chi/v5"

	"github.com/delve-mmo/game-server/internal/handler"
	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/middleware"
)

// New constructs and returns the application's http.Handler. Dependencies are
// injected explicitly so the handler tree can be constructed in tests without
// starting a real listener.
//
// authTokens is the list of valid Bearer tokens for protected routes. Pass nil
// or an empty slice to leave auth unconfigured (protected routes will return
// 503 — see middleware.TokenAuth).
func New(registry *instance.Registry, authTokens []string) http.Handler {
	r := chi.NewRouter()

	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	// Public — no auth required.
	r.Get("/status.json", handler.NewStatus(registry).ServeHTTP)

	// Protected — valid Bearer token required.
	instances := handler.NewInstances(registry)
	r.Group(func(r chi.Router) {
		r.Use(middleware.TokenAuth(authTokens))
		r.Route("/instances", func(r chi.Router) {
			r.Get("/", instances.List)
			r.Post("/", instances.Create)
			r.Route("/{instanceID}", func(r chi.Router) {
				r.Get("/", instances.Show)
				r.Delete("/", instances.Destroy)
			})
		})
	})

	return r
}
