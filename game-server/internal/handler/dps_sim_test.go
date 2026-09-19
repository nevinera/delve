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

func dummyEnemy() map[string]any {
	return map[string]any{
		"name":        "Training Dummy Attacker",
		"tokenRadius": 2.0,
		"maxHP":       100,
		"dps":         10.0,
		"attackSpeed": 1.0,
		"resource":    map[string]any{"name": "none", "max": 0, "defaultValue": 0, "isFluid": false},
	}
}

func TestDPSSim_Simulate_ReturnsNineCellsCoveringEveryPlanAndElevation(t *testing.T) {
	router := mountDPSSim(handler.NewDPSSim())

	body, err := json.Marshal(map[string]any{
		"enemy":           dummyEnemy(),
		"durationSeconds": 100.0,
		"seed":            1,
	})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/dps-sim", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var resp struct {
		Results []map[string]any `json:"results"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Results, 9)

	seen := map[string]bool{}
	for _, cell := range resp.Results {
		key := cell["gearingPlan"].(string) + "@" + jsonNum(cell["elevation"])
		assert.False(t, seen[key], "duplicate cell %s", key)
		seen[key] = true
		assert.Greater(t, cell["dps"], 0.0)
	}
	for _, plan := range []string{"offense", "offenseWithDefense", "defense"} {
		for _, ee := range []string{"-10", "-5", "0"} {
			assert.True(t, seen[plan+"@"+ee], "missing cell %s@%s", plan, ee)
		}
	}
}

func jsonNum(v any) string {
	f := v.(float64)
	switch f {
	case -10:
		return "-10"
	case -5:
		return "-5"
	case 0:
		return "0"
	default:
		return "?"
	}
}

func TestDPSSim_Simulate_TankCellMitigatesMoreThanOffenseCellAtSameElevation(t *testing.T) {
	router := mountDPSSim(handler.NewDPSSim())

	body, err := json.Marshal(map[string]any{
		"enemy":           dummyEnemy(),
		"durationSeconds": 3600.0,
		"seed":            2,
	})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/dps-sim", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		Results []map[string]any `json:"results"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))

	var offenseDPS, defenseDPS float64
	for _, cell := range resp.Results {
		if cell["elevation"].(float64) != 0 {
			continue
		}
		switch cell["gearingPlan"] {
		case "offense":
			offenseDPS = cell["dps"].(float64)
		case "defense":
			defenseDPS = cell["dps"].(float64)
		}
	}
	assert.Greater(t, offenseDPS, defenseDPS)
}

func TestDPSSim_Simulate_SameSeedIsDeterministic(t *testing.T) {
	router := mountDPSSim(handler.NewDPSSim())

	body, err := json.Marshal(map[string]any{
		"enemy":           dummyEnemy(),
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
		"durationSeconds": 10.0,
	})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/dps-sim", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var resp struct {
		Results []map[string]any `json:"results"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	for _, cell := range resp.Results {
		assert.Equal(t, 0.0, cell["dps"])
		assert.Nil(t, cell["ttdSeconds"])
	}
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
			"enemy":           dummyEnemy(),
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
		"enemy": dummyEnemy(),
	})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/dps-sim", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var resp struct {
		Results []map[string]any `json:"results"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.NotEmpty(t, resp.Results)
}
