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

	"github.com/delve-mmo/game-server/internal/handler"
)

func mountDPSSim(h *handler.DPSSim) http.Handler {
	r := chi.NewRouter()
	r.Post("/dps-sim", h.Simulate)
	return r
}

func TestDPSSim_Simulate_ReturnsDPSAndBreakdown(t *testing.T) {
	router := mountDPSSim(handler.NewDPSSim())

	body := map[string]any{
		"enemy": map[string]any{
			"name":        "Training Dummy Attacker",
			"tokenRadius": 2.0,
			"maxHP":       100,
			"dps":         10.0,
			"attackSpeed": 1.0,
			"resource":    map[string]any{"name": "none", "max": 0, "defaultValue": 0, "isFluid": false},
		},
		"target":          map[string]any{},
		"durationSeconds": 100.0,
		"seed":            1,
	}
	data, err := json.Marshal(body)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/dps-sim", bytes.NewReader(data))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))

	assert.Equal(t, 100.0, resp["durationSeconds"])
	assert.Greater(t, resp["dps"], 0.0)
	assert.Equal(t, resp["dps"], resp["basicAttackDamage"].(float64)/100.0)
	assert.Equal(t, 0.0, resp["ttdSeconds"], "no maxHealth given, so TTD (MaxHealth/DPS) is 0")
}

func TestDPSSim_Simulate_SameSeedIsDeterministic(t *testing.T) {
	router := mountDPSSim(handler.NewDPSSim())

	body, err := json.Marshal(map[string]any{
		"enemy": map[string]any{
			"name":        "Dummy",
			"tokenRadius": 2.0,
			"maxHP":       100,
			"dps":         10.0,
			"attackSpeed": 1.0,
			"resource":    map[string]any{"name": "none", "max": 0, "defaultValue": 0, "isFluid": false},
		},
		"target":          map[string]any{},
		"durationSeconds": 50.0,
		"seed":            7,
	})
	require.NoError(t, err)

	run := func() []byte {
		req := httptest.NewRequest(http.MethodPost, "/dps-sim", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusOK, rec.Code)
		return rec.Body.Bytes()
	}

	assert.Equal(t, run(), run())
}

func TestDPSSim_Simulate_TTDNullWhenEnemyDealsNoDamage(t *testing.T) {
	router := mountDPSSim(handler.NewDPSSim())

	body, err := json.Marshal(map[string]any{
		"enemy":           map[string]any{}, // no attackSpeed, no powers -> deals 0 damage
		"target":          map[string]any{"maxHealth": 200.0},
		"durationSeconds": 10.0,
	})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/dps-sim", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, 0.0, resp["dps"])
	assert.Nil(t, resp["ttdSeconds"], "a target that takes no damage has an undefined (null) TTD, not 0 or +Inf")
}

func TestDPSSim_Simulate_TTDPresentWhenTargetHasHealthAndTakesDamage(t *testing.T) {
	router := mountDPSSim(handler.NewDPSSim())

	body, err := json.Marshal(map[string]any{
		"enemy": map[string]any{
			"name":        "Dummy",
			"tokenRadius": 2.0,
			"maxHP":       100,
			"dps":         10.0,
			"attackSpeed": 1.0,
			"resource":    map[string]any{"name": "none", "max": 0, "defaultValue": 0, "isFluid": false},
		},
		"target":          map[string]any{"maxHealth": 200.0},
		"durationSeconds": 100.0,
		"seed":            3,
	})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/dps-sim", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.NotNil(t, resp["ttdSeconds"])
	assert.InDelta(t, 200.0/resp["dps"].(float64), resp["ttdSeconds"].(float64), 0.001)
}

func TestDPSSim_Simulate_InvalidBody(t *testing.T) {
	router := mountDPSSim(handler.NewDPSSim())

	req := httptest.NewRequest(http.MethodPost, "/dps-sim", bytes.NewReader([]byte("not json")))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

func TestDPSSim_Simulate_DurationOutOfBoundsRejected(t *testing.T) {
	router := mountDPSSim(handler.NewDPSSim())

	for _, duration := range []float64{0, -1, 3601} {
		body, err := json.Marshal(map[string]any{
			"enemy":           map[string]any{},
			"target":          map[string]any{},
			"durationSeconds": duration,
		})
		require.NoError(t, err)

		req := httptest.NewRequest(http.MethodPost, "/dps-sim", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusUnprocessableEntity, rec.Code, "duration %v should be rejected", duration)
	}
}

func TestDPSSim_Simulate_DefaultDurationAppliedWhenOmitted(t *testing.T) {
	router := mountDPSSim(handler.NewDPSSim())

	body, err := json.Marshal(map[string]any{
		"enemy":  map[string]any{},
		"target": map[string]any{},
	})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/dps-sim", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, handler.DefaultDPSSimDuration, resp["durationSeconds"])
}
