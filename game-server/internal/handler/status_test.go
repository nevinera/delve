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
	"github.com/delve-mmo/game-server/internal/zoneconfig"
)

func TestStatus(t *testing.T) {
	tests := []struct {
		name              string
		setup             func(*instance.Registry)
		wantStatus        int
		wantInstanceCount int
		wantVersion       string
		wantOKStatus      string
	}{
		{
			name:              "empty registry",
			wantStatus:        http.StatusOK,
			wantInstanceCount: 0,
			wantVersion:       version.Current,
			wantOKStatus:      "ok",
		},
		{
			name: "reflects live instance count",
			setup: func(r *instance.Registry) {
				r.Add(instance.NewInstance(uuid.New(), "db-1", "zone-1", "v1", "http://x", zoneconfig.Zone{}))
				r.Add(instance.NewInstance(uuid.New(), "db-2", "zone-1", "v1", "http://x", zoneconfig.Zone{}))
			},
			wantStatus:        http.StatusOK,
			wantInstanceCount: 2,
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
			assert.Equal(t, tt.wantVersion, body["version"])
		})
	}
}
