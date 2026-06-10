package server

import (
	"net/http"

	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/chi/v5"

	"github.com/delve-mmo/game-server/internal/config"
	"github.com/delve-mmo/game-server/internal/handler"
	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/middleware"
)

// New constructs and returns the application's http.Handler. Dependencies are
// injected explicitly so the handler tree can be constructed in tests without
// starting a real listener.
func New(registry *instance.Registry, cfg *config.Config) http.Handler {
	r := chi.NewRouter()

	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	// Public — no auth required.
	r.Get("/status.json", handler.NewStatus(registry).ServeHTTP)

	// Protected — valid Bearer token required.
	instances := handler.NewInstances(registry, cfg.MaxSlots)
	r.Group(func(r chi.Router) {
		r.Use(middleware.TokenAuth(cfg.AuthTokens))
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
