package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/version"
)

type statusResponse struct {
	Status        string `json:"status"`
	InstanceCount int    `json:"instance_count"`
	Version       string `json:"version"`
}

// Status handles GET /status.json. It holds a reference to the registry so
// instance_count reflects live state once instances are managed.
type Status struct {
	registry *instance.Registry
}

func NewStatus(registry *instance.Registry) *Status {
	return &Status{registry: registry}
}

func (h *Status) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	resp := statusResponse{
		Status:        "ok",
		InstanceCount: h.registry.Count(),
		Version:       version.Current,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		// Headers are already sent at this point, so we can only log.
		slog.ErrorContext(r.Context(), "failed to encode status response", "err", err)
	}
}
