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
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// mountRequest builds a router with only POST /slots/request wired up.
func mountRequest(sh *handler.Slots) http.Handler {
	r := chi.NewRouter()
	r.Post("/slots/request", sh.Request)
	return r
}

func newSlotsHandler(reg *instance.Registry, maxInstances int) *handler.Slots {
	return handler.NewSlots(reg, maxInstances, instance.DefaultMaxSlots)
}

// validZoneConfig returns a minimal zone config that can actually start.
func validZoneConfig() instanceconfig.Zone {
	return instanceconfig.Zone{
		Name: "Test Zone",
		Maps: []instanceconfig.Map{{
			Identifier:     "m1",
			Name:           "Map 1",
			FeetDimensions: instanceconfig.Dimensions{Width: 20, Height: 20},
		}},
	}
}

func validRequestBody(extras map[string]any) []byte {
	base := map[string]any{
		"zone_identifier": "goblin-cave",
		"version":         "v1",
		"database_id":     "db-1",
		"source_url":      "http://x",
		"zone_config":     validZoneConfig(),
		"character_name":  "Aldric",
		"character_class": map[string]any{
			"name":   "Puncher",
			"colors": map[string]any{"major": "8B4513", "minor": "F4A460"},
		},
	}
	for k, v := range extras {
		base[k] = v
	}
	data, _ := json.Marshal(base)
	return data
}

func postRequest(t *testing.T, router http.Handler, body []byte) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/slots/request", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func decodeRequestResponse(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&body))
	return body
}

// --- validation ---

func TestSlotsRequest_MissingRequiredFields(t *testing.T) {
	for _, field := range []string{"zone_identifier", "version", "database_id", "source_url", "character_name"} {
		t.Run("missing_"+field, func(t *testing.T) {
			reg := instance.NewRegistry()
			router := mountRequest(newSlotsHandler(reg, 200))
			body := validRequestBody(map[string]any{field: ""})
			rec := postRequest(t, router, body)
			assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
		})
	}
}

func TestSlotsRequest_MalformedJSON(t *testing.T) {
	reg := instance.NewRegistry()
	router := mountRequest(newSlotsHandler(reg, 200))
	req := httptest.NewRequest(http.MethodPost, "/slots/request", bytes.NewReader([]byte(`{bad`)))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

func TestSlotsRequest_BodyTooLarge(t *testing.T) {
	reg := instance.NewRegistry()
	router := mountRequest(newSlotsHandler(reg, 200))
	huge := make([]byte, handler.MaxRequestBytes+2)
	req := httptest.NewRequest(http.MethodPost, "/slots/request", bytes.NewReader(huge))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)
}

// --- specific instance_identifier ---

func TestSlotsRequest_SpecificInstance_Success(t *testing.T) {
	reg := instance.NewRegistry()
	inst := addTestInstance(t, reg)
	inst.ZoneIdentifier = "goblin-cave"
	router := mountRequest(newSlotsHandler(reg, 200))

	rec := postRequest(t, router, validRequestBody(map[string]any{
		"instance_identifier": inst.Identifier.String(),
	}))

	assert.Equal(t, http.StatusCreated, rec.Code)
	body := decodeRequestResponse(t, rec)
	assert.Equal(t, inst.Identifier.String(), body["instance_identifier"])
	assert.NotEmpty(t, body["slot_id"])
	assert.NotEmpty(t, body["token"])
}

func TestSlotsRequest_SpecificInstance_NotFound(t *testing.T) {
	reg := instance.NewRegistry()
	router := mountRequest(newSlotsHandler(reg, 200))

	rec := postRequest(t, router, validRequestBody(map[string]any{
		"instance_identifier": uuid.New().String(),
	}))

	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestSlotsRequest_SpecificInstance_InvalidUUID(t *testing.T) {
	reg := instance.NewRegistry()
	router := mountRequest(newSlotsHandler(reg, 200))

	rec := postRequest(t, router, validRequestBody(map[string]any{
		"instance_identifier": "not-a-uuid",
	}))

	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

func TestSlotsRequest_SpecificInstance_ZoneMismatch(t *testing.T) {
	reg := instance.NewRegistry()
	inst := addTestInstance(t, reg)
	inst.ZoneIdentifier = "other-zone"
	router := mountRequest(newSlotsHandler(reg, 200))

	rec := postRequest(t, router, validRequestBody(map[string]any{
		"instance_identifier": inst.Identifier.String(),
	}))

	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	body := decodeRequestResponse(t, rec)
	assert.Contains(t, body["error"], "different zone")
}

func TestSlotsRequest_SpecificInstance_Full(t *testing.T) {
	reg := instance.NewRegistry()
	inst := addTestInstance(t, reg)
	inst.ZoneIdentifier = "goblin-cave"
	inst.MaxSlots = 1
	_, err := inst.AddSlot("Brego", instanceconfig.CharacterClass{Name: "Puncher"})
	require.NoError(t, err)
	router := mountRequest(newSlotsHandler(reg, 200))

	rec := postRequest(t, router, validRequestBody(map[string]any{
		"instance_identifier": inst.Identifier.String(),
	}))

	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	body := decodeRequestResponse(t, rec)
	assert.Contains(t, body["error"], "max slot capacity")
}

// --- auto instance selection / creation ---

func TestSlotsRequest_Auto_UsesExistingInstance(t *testing.T) {
	reg := instance.NewRegistry()
	router := mountRequest(newSlotsHandler(reg, 200))

	// First request creates an instance.
	rec1 := postRequest(t, router, validRequestBody(nil))
	require.Equal(t, http.StatusCreated, rec1.Code)
	body1 := decodeRequestResponse(t, rec1)

	// Second request should reuse it.
	rec2 := postRequest(t, router, validRequestBody(nil))
	require.Equal(t, http.StatusCreated, rec2.Code)
	body2 := decodeRequestResponse(t, rec2)

	assert.Equal(t, body1["instance_identifier"], body2["instance_identifier"])
	assert.Equal(t, 1, reg.Count())
}

func TestSlotsRequest_Auto_CreatesInstance_WhenNoneExists(t *testing.T) {
	reg := instance.NewRegistry()
	router := mountRequest(newSlotsHandler(reg, 200))

	rec := postRequest(t, router, validRequestBody(nil))

	assert.Equal(t, http.StatusCreated, rec.Code)
	assert.Equal(t, 1, reg.Count())
	body := decodeRequestResponse(t, rec)
	assert.NotEmpty(t, body["instance_identifier"])
	assert.NotEmpty(t, body["slot_id"])
	assert.NotEmpty(t, body["token"])
}

func TestSlotsRequest_Auto_CreatesNewInstance_WhenExistingFull(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg, 200, 1) // maxSlots=1 so each instance holds one player
	router := mountRequest(sh)

	rec1 := postRequest(t, router, validRequestBody(nil))
	require.Equal(t, http.StatusCreated, rec1.Code)

	rec2 := postRequest(t, router, validRequestBody(nil))
	require.Equal(t, http.StatusCreated, rec2.Code)

	assert.Equal(t, 2, reg.Count())
	body1 := decodeRequestResponse(t, rec1)
	body2 := decodeRequestResponse(t, rec2)
	assert.NotEqual(t, body1["instance_identifier"], body2["instance_identifier"])
}

func TestSlotsRequest_Auto_ServerAtCapacity(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg, 1, 1) // maxInstances=1, maxSlots=1
	router := mountRequest(sh)

	// Fill the one allowed instance.
	rec1 := postRequest(t, router, validRequestBody(nil))
	require.Equal(t, http.StatusCreated, rec1.Code)

	// Second request: existing instance is full and we're at the instance limit.
	rec2 := postRequest(t, router, validRequestBody(nil))
	assert.Equal(t, http.StatusServiceUnavailable, rec2.Code)
	body := decodeRequestResponse(t, rec2)
	assert.Contains(t, body["error"], "maximum instance capacity")
}

func TestSlotsRequest_Auto_InvalidZoneConfig(t *testing.T) {
	reg := instance.NewRegistry()
	router := mountRequest(newSlotsHandler(reg, 200))

	// Zone config with a unit missing an identifier - Start() will fail.
	badConfig := map[string]any{
		"name": "Bad Zone",
		"maps": []map[string]any{{
			"identifier": "m1", "name": "Map 1",
			"feetDimensions": map[string]any{"width": 10.0, "height": 10.0},
			"units": []map[string]any{
				{"unitType": "goblin", "position": map[string]any{"x": 0, "y": 0, "angle": 0}, "hostility": "hostile"},
			},
		}},
		"unitTypes": map[string]any{
			"goblin": map[string]any{
				"name": "Goblin", "tokenRadius": 1.0, "maxHP": 10,
				"resource":  map[string]any{"name": "Energy", "max": 10.0, "defaultValue": 10.0, "returnRate": 0.0, "isFluid": true},
				"targeting": map[string]any{"type": "nearest"},
				"tactics":   map[string]any{"type": "randomAvailable"},
			},
		},
	}

	body, _ := json.Marshal(map[string]any{
		"zone_identifier": "goblin-cave",
		"version":         "v1",
		"database_id":     "db-1",
		"source_url":      "http://x",
		"zone_config":     badConfig,
		"character_name":  "Aldric",
		"character_class": map[string]any{"name": "Puncher"},
	})
	req := httptest.NewRequest(http.MethodPost, "/slots/request", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	assert.Equal(t, 0, reg.Count())
}

// --- server_test routing/auth coverage ---

func TestSlotsRequest_RouteRegistered(t *testing.T) {
	reg := instance.NewRegistry()
	r := chi.NewRouter()
	sh := handler.NewSlots(reg, 200, instance.DefaultMaxSlots)
	r.Post("/slots/request", sh.Request)

	req := httptest.NewRequest(http.MethodGet, "/slots/request", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusMethodNotAllowed, rec.Code)
}

func TestSlotsRequest_VersionMismatch_CreatesNewInstance(t *testing.T) {
	reg := instance.NewRegistry()
	router := mountRequest(newSlotsHandler(reg, 200))

	rec1 := postRequest(t, router, validRequestBody(map[string]any{"version": "v1"}))
	require.Equal(t, http.StatusCreated, rec1.Code)

	rec2 := postRequest(t, router, validRequestBody(map[string]any{"version": "v2"}))
	require.Equal(t, http.StatusCreated, rec2.Code)

	assert.Equal(t, 2, reg.Count())
	body1 := decodeRequestResponse(t, rec1)
	body2 := decodeRequestResponse(t, rec2)
	assert.NotEqual(t, body1["instance_identifier"], body2["instance_identifier"])

	// A third request for v1 should reuse the first instance.
	rec3 := postRequest(t, router, validRequestBody(map[string]any{"version": "v1"}))
	require.Equal(t, http.StatusCreated, rec3.Code)
	body3 := decodeRequestResponse(t, rec3)
	assert.Equal(t, body1["instance_identifier"], body3["instance_identifier"])
}

func TestSlotsRequest_ResponseIncludesInstanceAndSlot(t *testing.T) {
	reg := instance.NewRegistry()
	router := mountRequest(newSlotsHandler(reg, 200))

	rec := postRequest(t, router, validRequestBody(nil))
	require.Equal(t, http.StatusCreated, rec.Code)

	body := decodeRequestResponse(t, rec)
	_, err := uuid.Parse(fmt.Sprintf("%v", body["instance_identifier"]))
	assert.NoError(t, err, "instance_identifier should be a valid UUID")
	_, err = uuid.Parse(fmt.Sprintf("%v", body["slot_id"]))
	assert.NoError(t, err, "slot_id should be a valid UUID")
	_, err = uuid.Parse(fmt.Sprintf("%v", body["token"]))
	assert.NoError(t, err, "token should be a valid UUID")
}
