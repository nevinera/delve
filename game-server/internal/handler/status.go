package handler

import (
	"net/http"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/version"
)

type statusResponse struct {
	Status             string `json:"status"`
	InstanceCount      int    `json:"instance_count"`
	TotalPlayerCount   int    `json:"total_player_count"`
	ActivePlayerCount  int    `json:"active_player_count"`
	Version            string `json:"version"`
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
	var totalPlayers, activePlayers int
	for _, inst := range h.registry.List() {
		t, a := inst.SlotCounts()
		totalPlayers += t
		activePlayers += a
	}

	resp := statusResponse{
		Status:            "ok",
		InstanceCount:     h.registry.Count(),
		TotalPlayerCount:  totalPlayers,
		ActivePlayerCount: activePlayers,
		Version:           version.Current,
	}

	writeJSON(w, r, http.StatusOK, resp)
}
