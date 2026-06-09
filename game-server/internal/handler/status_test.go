package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/delve-mmo/game-server/internal/handler"
	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/version"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStatus(t *testing.T) {
	tests := []struct {
		name              string
		wantStatus        int
		wantInstanceCount int
		wantVersion       string
		wantOKStatus      string
	}{
		{
			name:              "returns ok response",
			wantStatus:        http.StatusOK,
			wantInstanceCount: 0,
			wantVersion:       version.Current,
			wantOKStatus:      "ok",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			registry := instance.NewRegistry()
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
