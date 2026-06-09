package handler_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/handler"
	"github.com/delve-mmo/game-server/internal/instance"
)

// mountInstances wires the Instances handler onto a chi router with the same
// route pattern used in production, so URL parameter extraction works in tests.
func mountInstances(h *handler.Instances) http.Handler {
	r := chi.NewRouter()
	r.Get("/instances", h.List)
	r.Post("/instances", h.Create)
	r.Get("/instances/{instanceID}", h.Show)
	r.Delete("/instances/{instanceID}", h.Destroy)
	return r
}

func validCreateBody(id uuid.UUID) []byte {
	body := map[string]any{
		"identifier":      id.String(),
		"database_id":     "db-1",
		"zone_identifier": "goblin-cave",
		"version":         "abc123",
		"source_url":      "https://example.com/zones/goblin-cave.json",
		"zone_config": map[string]any{
			"name":    "Goblin Cave",
			"private": true,
			"maps": []map[string]any{
				{
					"identifier":      "room",
					"name":            "Room",
					"feetDimensions":  map[string]any{"width": 20.0, "height": 20.0},
				},
			},
		},
	}
	data, _ := json.Marshal(body)
	return data
}

// --- Create ---

func TestInstances_Create(t *testing.T) {
	reg := instance.NewRegistry()
	h := handler.NewInstances(reg)
	router := mountInstances(h)

	id := uuid.New()
	req := httptest.NewRequest(http.MethodPost, "/instances", bytes.NewReader(validCreateBody(id)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusCreated, rec.Code)
	assert.Equal(t, 1, reg.Count())

	var body map[string]any
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&body))
	assert.Equal(t, id.String(), body["identifier"])
	assert.Equal(t, "db-1", body["database_id"])
	assert.Equal(t, "loading", body["status"])
	assert.Equal(t, float64(instance.DefaultMaxSlots), body["max_slots"])
}

func TestInstances_Create_InvalidUUID(t *testing.T) {
	reg := instance.NewRegistry()
	h := handler.NewInstances(reg)
	router := mountInstances(h)

	body, _ := json.Marshal(map[string]any{
		"identifier": "not-a-uuid", "database_id": "db-1",
		"zone_identifier": "z", "version": "v", "source_url": "http://x",
		"zone_config": map[string]any{"name": "Z", "private": false,
			"maps": []map[string]any{{"identifier": "m", "name": "M",
				"feetDimensions": map[string]any{"width": 10.0, "height": 10.0}}}},
	})
	req := httptest.NewRequest(http.MethodPost, "/instances", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

func TestInstances_Create_MissingFields(t *testing.T) {
	reg := instance.NewRegistry()
	h := handler.NewInstances(reg)
	router := mountInstances(h)

	body, _ := json.Marshal(map[string]any{
		"identifier":  uuid.New().String(),
		"zone_config": map[string]any{"name": "Z", "private": false, "maps": []any{}},
	})
	req := httptest.NewRequest(http.MethodPost, "/instances", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

func TestInstances_Create_MalformedJSON(t *testing.T) {
	reg := instance.NewRegistry()
	h := handler.NewInstances(reg)
	router := mountInstances(h)

	req := httptest.NewRequest(http.MethodPost, "/instances", bytes.NewReader([]byte(`{bad json`)))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

func TestInstances_Create_AssetReferenceRejected(t *testing.T) {
	reg := instance.NewRegistry()
	h := handler.NewInstances(reg)
	router := mountInstances(h)

	body, _ := json.Marshal(map[string]any{
		"identifier": uuid.New().String(), "database_id": "db-1",
		"zone_identifier": "z", "version": "v", "source_url": "http://x",
		"zone_config": map[string]any{
			"name": "Abstract Zone", "private": true,
			"maps": []map[string]any{
				{"$ref": "./maps/room.json", "referenceTo": "map"},
			},
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/instances", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

// --- Show ---

func TestInstances_Show(t *testing.T) {
	reg := instance.NewRegistry()
	h := handler.NewInstances(reg)
	router := mountInstances(h)

	id := uuid.New()
	req := httptest.NewRequest(http.MethodPost, "/instances", bytes.NewReader(validCreateBody(id)))
	httptest.NewRecorder() // discard
	router.ServeHTTP(httptest.NewRecorder(), req)

	// Now show it
	showReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/instances/%s", id), nil)
	showRec := httptest.NewRecorder()
	router.ServeHTTP(showRec, showReq)

	assert.Equal(t, http.StatusOK, showRec.Code)
	var body map[string]any
	require.NoError(t, json.NewDecoder(showRec.Body).Decode(&body))
	assert.Equal(t, id.String(), body["identifier"])
}

func TestInstances_Show_NotFound(t *testing.T) {
	reg := instance.NewRegistry()
	h := handler.NewInstances(reg)
	router := mountInstances(h)

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/instances/%s", uuid.New()), nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestInstances_Show_InvalidUUID(t *testing.T) {
	reg := instance.NewRegistry()
	h := handler.NewInstances(reg)
	router := mountInstances(h)

	req := httptest.NewRequest(http.MethodGet, "/instances/not-a-uuid", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

// --- Destroy ---

func TestInstances_Destroy(t *testing.T) {
	reg := instance.NewRegistry()
	h := handler.NewInstances(reg)
	router := mountInstances(h)

	id := uuid.New()
	router.ServeHTTP(httptest.NewRecorder(),
		httptest.NewRequest(http.MethodPost, "/instances", bytes.NewReader(validCreateBody(id))))
	assert.Equal(t, 1, reg.Count())

	delReq := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/instances/%s", id), nil)
	delRec := httptest.NewRecorder()
	router.ServeHTTP(delRec, delReq)

	assert.Equal(t, http.StatusNoContent, delRec.Code)
	assert.Equal(t, 0, reg.Count())
}

func TestInstances_Destroy_NotFound(t *testing.T) {
	reg := instance.NewRegistry()
	h := handler.NewInstances(reg)
	router := mountInstances(h)

	req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/instances/%s", uuid.New()), nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

// --- List ---

func TestInstances_List_Empty(t *testing.T) {
	reg := instance.NewRegistry()
	h := handler.NewInstances(reg)
	router := mountInstances(h)

	req := httptest.NewRequest(http.MethodGet, "/instances", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	var body map[string]any
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&body))
	assert.Empty(t, body["instances"])
}

func TestInstances_List_AfterCreate(t *testing.T) {
	reg := instance.NewRegistry()
	h := handler.NewInstances(reg)
	router := mountInstances(h)

	for range 3 {
		router.ServeHTTP(httptest.NewRecorder(),
			httptest.NewRequest(http.MethodPost, "/instances",
				bytes.NewReader(validCreateBody(uuid.New()))))
	}

	req := httptest.NewRequest(http.MethodGet, "/instances", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	var body map[string]any
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&body))
	instances := body["instances"].([]any)
	assert.Len(t, instances, 3)
}

// --- ZoneConfig not echoed in responses ---

func TestInstances_ResponseExcludesZoneConfig(t *testing.T) {
	reg := instance.NewRegistry()
	h := handler.NewInstances(reg)
	router := mountInstances(h)

	id := uuid.New()
	router.ServeHTTP(httptest.NewRecorder(),
		httptest.NewRequest(http.MethodPost, "/instances", bytes.NewReader(validCreateBody(id))))

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/instances/%s", id), nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var body map[string]any
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&body))
	_, hasZoneConfig := body["zone_config"]
	assert.False(t, hasZoneConfig, "zone_config must not appear in instance responses")
}
