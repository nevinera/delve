package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/delve-mmo/game-server/internal/handler"
	"github.com/delve-mmo/game-server/internal/instance"
)

// New constructs and returns the application's http.Handler. Dependencies are
// injected explicitly so the handler tree can be constructed in tests without
// starting a real listener.
func New(registry *instance.Registry) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/status.json", handler.NewStatus(registry).ServeHTTP)

	return r
}
