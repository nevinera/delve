package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/classdps"
	"github.com/delve-mmo/game-server/internal/handler"
)

func mountClassDPSSim(h *handler.ClassDPSSim) http.Handler {
	r := chi.NewRouter()
	r.Post("/class-dps-sim", h.Simulate)
	return r
}

func punchingClass() map[string]any {
	return map[string]any{
		"primaryStats":   []string{"strength"},
		"secondaryStats": []string{"crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "stamina"},
		"wields":         []string{"dagger", "dagger"},
	}
}

func TestClassDPSSim_Simulate_ReturnsOneCellPerDurationAndElevation(t *testing.T) {
	router := mountClassDPSSim(handler.NewClassDPSSim())

	body, err := json.Marshal(map[string]any{"class": punchingClass()})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/class-dps-sim", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var resp struct {
		Results []map[string]any `json:"results"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Results, len(classdps.Durations)*len(classdps.Elevations))

	type key struct {
		duration, elevation float64
	}
	seen := map[key]bool{}
	for _, cell := range resp.Results {
		k := key{cell["durationSeconds"].(float64), cell["elevation"].(float64)}
		assert.False(t, seen[k], "duplicate cell %+v", k)
		seen[k] = true
		assert.Greater(t, cell["dps"], 0.0)
		assert.NotEmpty(t, cell["elevationLabel"])
	}
}

func TestClassDPSSim_Simulate_StrategyPowerContributesPowerDamage(t *testing.T) {
	router := mountClassDPSSim(handler.NewClassDPSSim())

	body, err := json.Marshal(map[string]any{
		"class": map[string]any{
			"powers": []map[string]any{{
				"name":           "Bolt",
				"globalCooldown": 1.5,
				"effects": []map[string]any{{
					"type":   "harm",
					"amount": []float64{50, 50},
				}},
			}},
		},
		"strategy": []map[string]any{{"power": "Bolt"}},
	})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/class-dps-sim", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var resp struct {
		Results []map[string]any `json:"results"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.NotEmpty(t, resp.Results)
	for _, cell := range resp.Results {
		assert.Greater(t, cell["powerDamage"], 0.0)
	}
}

func TestClassDPSSim_Simulate_InvalidBody(t *testing.T) {
	router := mountClassDPSSim(handler.NewClassDPSSim())

	req := httptest.NewRequest(http.MethodPost, "/class-dps-sim", bytes.NewReader([]byte("not json")))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}
