package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/handler"
	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/version"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func TestStatus(t *testing.T) {
	tests := []struct {
		name              string
		setup             func(*instance.Registry)
		wantStatus        int
		wantInstanceCount int
		wantTotalPlayers  int
		wantActivePlayers int
		wantVersion       string
		wantOKStatus      string
	}{
		{
			name:              "empty registry",
			wantStatus:        http.StatusOK,
			wantInstanceCount: 0,
			wantTotalPlayers:  0,
			wantActivePlayers: 0,
			wantVersion:       version.Current,
			wantOKStatus:      "ok",
		},
		{
			name: "reflects live instance count",
			setup: func(r *instance.Registry) {
				r.Add(instance.NewInstance(uuid.New(), "db-1", "zone-1", "v1", "http://x", instanceconfig.Zone{}, instance.DefaultMaxSlots))
				r.Add(instance.NewInstance(uuid.New(), "db-2", "zone-1", "v1", "http://x", instanceconfig.Zone{}, instance.DefaultMaxSlots))
			},
			wantStatus:        http.StatusOK,
			wantInstanceCount: 2,
			wantTotalPlayers:  0,
			wantActivePlayers: 0,
			wantVersion:       version.Current,
			wantOKStatus:      "ok",
		},
		{
			name: "counts slots across instances",
			setup: func(r *instance.Registry) {
				inst1 := instance.NewInstance(uuid.New(), "db-1", "zone-1", "v1", "http://x", instanceconfig.Zone{}, instance.DefaultMaxSlots)
				inst2 := instance.NewInstance(uuid.New(), "db-2", "zone-1", "v1", "http://x", instanceconfig.Zone{}, instance.DefaultMaxSlots)
				class := instanceconfig.CharacterClass{Name: "Puncher"}
				slot1, _ := inst1.AddSlot("Aldric", class)
				inst1.SetSlotState(slot1.ID, instance.SlotStateConnected)
				inst1.AddSlot("Brego", class) // pending
				inst2.AddSlot("Caela", class) // pending
				r.Add(inst1)
				r.Add(inst2)
			},
			wantStatus:        http.StatusOK,
			wantInstanceCount: 2,
			wantTotalPlayers:  3,
			wantActivePlayers: 1,
			wantVersion:       version.Current,
			wantOKStatus:      "ok",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			registry := instance.NewRegistry()
			if tt.setup != nil {
				tt.setup(registry)
			}
			h := handler.NewStatus(registry)

			req := httptest.NewRequest(http.MethodGet, "/status.json", nil)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)

			assert.Equal(t, tt.wantStatus, rec.Code)
			assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))

			var body map[string]any
			require.NoError(t, json.NewDecoder(rec.Body).Decode(&body))
			assert.Equal(t, tt.wantOKStatus, body["status"])
			assert.Equal(t, float64(tt.wantInstanceCount), body["instance_count"])
			assert.Equal(t, float64(tt.wantTotalPlayers), body["total_player_count"])
			assert.Equal(t, float64(tt.wantActivePlayers), body["active_player_count"])
			assert.Equal(t, tt.wantVersion, body["version"])
		})
	}
}
