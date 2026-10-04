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

func postClassTTDSim(t *testing.T, payload any) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	r.Post("/class-ttd-sim", handler.NewClassTTDSim().Simulate)

	body, err := json.Marshal(payload)
	require.NoError(t, err)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/class-ttd-sim", bytes.NewReader(body)))
	return rec
}

func TestClassTTDSim_Simulate_ReturnsSurvivabilityCells(t *testing.T) {
	rec := postClassTTDSim(t, map[string]any{"class": punchingClass(), "seed": 1})

	require.Equal(t, http.StatusOK, rec.Code)
	var resp struct {
		Results []map[string]any `json:"results"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.NotEmpty(t, resp.Results)
	for _, cell := range resp.Results {
		assert.Equal(t, "hybrid", cell["priority"])
		assert.Equal(t, 300.0, cell["capSeconds"])
		assert.Contains(t, cell, "ttd")
		assert.Contains(t, cell, "hpLostPct")
		assert.Contains(t, cell, "survives")
	}
}

func TestClassTTDSim_Simulate_ExtendedRaisesTheCap(t *testing.T) {
	rec := postClassTTDSim(t, map[string]any{"class": punchingClass(), "seed": 1, "extended": true})

	require.Equal(t, http.StatusOK, rec.Code)
	var resp struct {
		Results []map[string]any `json:"results"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, 1200.0, resp.Results[0]["capSeconds"])
}

func TestClassTTDSim_Simulate_RejectsMalformedBody(t *testing.T) {
	r := chi.NewRouter()
	r.Post("/class-ttd-sim", handler.NewClassTTDSim().Simulate)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/class-ttd-sim", bytes.NewReader([]byte("nope"))))
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}
