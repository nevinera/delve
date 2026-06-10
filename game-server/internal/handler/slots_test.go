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

// mountSlots wires both the instance and slot handlers onto a router matching
// the production route pattern, so URL parameter extraction works in tests.
func mountSlots(ih *handler.Instances, sh *handler.Slots) http.Handler {
	r := chi.NewRouter()
	r.Post("/instances", ih.Create)
	r.Route("/instances/{instanceID}", func(r chi.Router) {
		r.Get("/", ih.Show)
		r.Delete("/", ih.Destroy)
		r.Route("/slots", func(r chi.Router) {
			r.Get("/", sh.List)
			r.Post("/", sh.Create)
			r.Route("/{slotID}", func(r chi.Router) {
				r.Get("/", sh.Show)
				r.Delete("/", sh.Destroy)
			})
		})
	})
	return r
}

// addTestInstance creates a minimal started instance and adds it to reg.
func addTestInstance(t *testing.T, reg *instance.Registry) *instance.Instance {
	t.Helper()
	inst := instance.NewInstance(
		uuid.New(), "db-1", "zone-test", "v1", "http://x",
		instanceconfig.Zone{Name: "Z", Private: true, Maps: []instanceconfig.Map{{
			Identifier:     "m",
			Name:           "M",
			FeetDimensions: instanceconfig.Dimensions{Width: 20, Height: 20},
		}}},
		instance.DefaultMaxSlots,
	)
	require.NoError(t, inst.Start())
	t.Cleanup(inst.Stop)
	reg.Add(inst)
	return inst
}

func validCreateSlotBody(name string) []byte {
	body := map[string]any{
		"character_name": name,
		"character_class": map[string]any{
			"name":   "Puncher",
			"colors": map[string]any{"major": "8B4513", "minor": "F4A460"},
		},
	}
	data, _ := json.Marshal(body)
	return data
}

// --- Create ---

func TestSlots_Create(t *testing.T) {
	reg := instance.NewRegistry()
	ih := handler.NewInstances(reg, instance.DefaultMaxSlots)
	sh := handler.NewSlots(reg)
	router := mountSlots(ih, sh)
	inst := addTestInstance(t, reg)

	req := httptest.NewRequest(http.MethodPost,
		fmt.Sprintf("/instances/%s/slots", inst.Identifier),
		bytes.NewReader(validCreateSlotBody("Aldric")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusCreated, rec.Code)
	assert.Len(t, inst.ListSlots(), 1)

	var body map[string]any
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&body))
	assert.NotEmpty(t, body["id"])
	assert.NotEmpty(t, body["token"])
	assert.Equal(t, "pending", body["state"])
	assert.Equal(t, "Aldric", body["character_name"])
}

func TestSlots_Create_InstanceNotFound(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg)
	router := mountSlots(handler.NewInstances(reg, instance.DefaultMaxSlots), sh)

	req := httptest.NewRequest(http.MethodPost,
		fmt.Sprintf("/instances/%s/slots", uuid.New()),
		bytes.NewReader(validCreateSlotBody("Aldric")))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestSlots_Create_InvalidInstanceUUID(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg)
	router := mountSlots(handler.NewInstances(reg, instance.DefaultMaxSlots), sh)

	req := httptest.NewRequest(http.MethodPost, "/instances/not-a-uuid/slots",
		bytes.NewReader(validCreateSlotBody("Aldric")))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestSlots_Create_MissingCharacterName(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg)
	router := mountSlots(handler.NewInstances(reg, instance.DefaultMaxSlots), sh)
	inst := addTestInstance(t, reg)

	body, _ := json.Marshal(map[string]any{
		"character_class": map[string]any{
			"name":   "Puncher",
			"colors": map[string]any{"major": "8B4513", "minor": "F4A460"},
		},
	})
	req := httptest.NewRequest(http.MethodPost,
		fmt.Sprintf("/instances/%s/slots", inst.Identifier),
		bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

func TestSlots_Create_InstanceFull(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg)
	router := mountSlots(handler.NewInstances(reg, 1), sh)
	inst := addTestInstance(t, reg)
	inst.MaxSlots = 1

	// Fill the slot.
	req := httptest.NewRequest(http.MethodPost,
		fmt.Sprintf("/instances/%s/slots", inst.Identifier),
		bytes.NewReader(validCreateSlotBody("Aldric")))
	router.ServeHTTP(httptest.NewRecorder(), req)

	// Second attempt should fail.
	req2 := httptest.NewRequest(http.MethodPost,
		fmt.Sprintf("/instances/%s/slots", inst.Identifier),
		bytes.NewReader(validCreateSlotBody("Brego")))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req2)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)

	var body map[string]any
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&body))
	assert.Contains(t, body["error"], "max slot capacity")
}

func TestSlots_Create_BodyTooLarge(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg)
	router := mountSlots(handler.NewInstances(reg, instance.DefaultMaxSlots), sh)
	inst := addTestInstance(t, reg)

	huge := make([]byte, handler.MaxRequestBytes+2)
	req := httptest.NewRequest(http.MethodPost,
		fmt.Sprintf("/instances/%s/slots", inst.Identifier),
		bytes.NewReader(huge))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)
}

func TestSlots_Create_MalformedJSON(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg)
	router := mountSlots(handler.NewInstances(reg, instance.DefaultMaxSlots), sh)
	inst := addTestInstance(t, reg)

	req := httptest.NewRequest(http.MethodPost,
		fmt.Sprintf("/instances/%s/slots", inst.Identifier),
		bytes.NewReader([]byte(`{bad`)))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

func TestSlots_Create_TokenNotReturnedOnSubsequentRequests(t *testing.T) {
	reg := instance.NewRegistry()
	ih := handler.NewInstances(reg, instance.DefaultMaxSlots)
	sh := handler.NewSlots(reg)
	router := mountSlots(ih, sh)
	inst := addTestInstance(t, reg)

	// Create the slot and capture its ID.
	createReq := httptest.NewRequest(http.MethodPost,
		fmt.Sprintf("/instances/%s/slots", inst.Identifier),
		bytes.NewReader(validCreateSlotBody("Aldric")))
	createRec := httptest.NewRecorder()
	router.ServeHTTP(createRec, createReq)
	require.Equal(t, http.StatusCreated, createRec.Code)

	var createBody map[string]any
	require.NoError(t, json.NewDecoder(createRec.Body).Decode(&createBody))
	slotID := createBody["id"].(string)

	// Show should not include token.
	showReq := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/instances/%s/slots/%s", inst.Identifier, slotID), nil)
	showRec := httptest.NewRecorder()
	router.ServeHTTP(showRec, showReq)
	require.Equal(t, http.StatusOK, showRec.Code)

	var showBody map[string]any
	require.NoError(t, json.NewDecoder(showRec.Body).Decode(&showBody))
	_, hasToken := showBody["token"]
	assert.False(t, hasToken, "token must not appear in show response")
}

// --- Show ---

func TestSlots_Show(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg)
	router := mountSlots(handler.NewInstances(reg, instance.DefaultMaxSlots), sh)
	inst := addTestInstance(t, reg)

	slot, err := inst.AddSlot("Aldric", instanceconfig.CharacterClass{
		Name: "Puncher", Colors: instanceconfig.Colors{Major: "8B4513", Minor: "F4A460"},
	})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/instances/%s/slots/%s", inst.Identifier, slot.ID), nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	var body map[string]any
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&body))
	assert.Equal(t, slot.ID.String(), body["id"])
	assert.Equal(t, "Aldric", body["character_name"])
	assert.Equal(t, "pending", body["state"])
}

func TestSlots_Show_InstanceNotFound(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg)
	router := mountSlots(handler.NewInstances(reg, instance.DefaultMaxSlots), sh)

	req := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/instances/%s/slots/%s", uuid.New(), uuid.New()), nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestSlots_Show_NotFound(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg)
	router := mountSlots(handler.NewInstances(reg, instance.DefaultMaxSlots), sh)
	inst := addTestInstance(t, reg)

	req := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/instances/%s/slots/%s", inst.Identifier, uuid.New()), nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestSlots_Show_InvalidSlotUUID(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg)
	router := mountSlots(handler.NewInstances(reg, instance.DefaultMaxSlots), sh)
	inst := addTestInstance(t, reg)

	req := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/instances/%s/slots/not-a-uuid", inst.Identifier), nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

// --- List ---

func TestSlots_List_InstanceNotFound(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg)
	router := mountSlots(handler.NewInstances(reg, instance.DefaultMaxSlots), sh)

	req := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/instances/%s/slots", uuid.New()), nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestSlots_List_Empty(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg)
	router := mountSlots(handler.NewInstances(reg, instance.DefaultMaxSlots), sh)
	inst := addTestInstance(t, reg)

	req := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/instances/%s/slots", inst.Identifier), nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	var body map[string]any
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&body))
	assert.Empty(t, body["slots"])
}

func TestSlots_List_AfterCreate(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg)
	router := mountSlots(handler.NewInstances(reg, instance.DefaultMaxSlots), sh)
	inst := addTestInstance(t, reg)

	for _, name := range []string{"Aldric", "Brego", "Caela"} {
		req := httptest.NewRequest(http.MethodPost,
			fmt.Sprintf("/instances/%s/slots", inst.Identifier),
			bytes.NewReader(validCreateSlotBody(name)))
		router.ServeHTTP(httptest.NewRecorder(), req)
	}

	req := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/instances/%s/slots", inst.Identifier), nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	var body map[string]any
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&body))
	assert.Len(t, body["slots"].([]any), 3)
}

func TestSlots_List_NoTokenInResponse(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg)
	router := mountSlots(handler.NewInstances(reg, instance.DefaultMaxSlots), sh)
	inst := addTestInstance(t, reg)

	req := httptest.NewRequest(http.MethodPost,
		fmt.Sprintf("/instances/%s/slots", inst.Identifier),
		bytes.NewReader(validCreateSlotBody("Aldric")))
	router.ServeHTTP(httptest.NewRecorder(), req)

	listReq := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/instances/%s/slots", inst.Identifier), nil)
	listRec := httptest.NewRecorder()
	router.ServeHTTP(listRec, listReq)

	var body map[string]any
	require.NoError(t, json.NewDecoder(listRec.Body).Decode(&body))
	slots := body["slots"].([]any)
	require.Len(t, slots, 1)
	_, hasToken := slots[0].(map[string]any)["token"]
	assert.False(t, hasToken, "token must not appear in list response")
}

// --- Destroy ---

func TestSlots_Destroy(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg)
	router := mountSlots(handler.NewInstances(reg, instance.DefaultMaxSlots), sh)
	inst := addTestInstance(t, reg)

	slot, err := inst.AddSlot("Aldric", instanceconfig.CharacterClass{
		Name: "Puncher", Colors: instanceconfig.Colors{Major: "8B4513", Minor: "F4A460"},
	})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodDelete,
		fmt.Sprintf("/instances/%s/slots/%s", inst.Identifier, slot.ID), nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Empty(t, inst.ListSlots())
}

func TestSlots_Destroy_InstanceNotFound(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg)
	router := mountSlots(handler.NewInstances(reg, instance.DefaultMaxSlots), sh)

	req := httptest.NewRequest(http.MethodDelete,
		fmt.Sprintf("/instances/%s/slots/%s", uuid.New(), uuid.New()), nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestSlots_Destroy_NotFound(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg)
	router := mountSlots(handler.NewInstances(reg, instance.DefaultMaxSlots), sh)
	inst := addTestInstance(t, reg)

	req := httptest.NewRequest(http.MethodDelete,
		fmt.Sprintf("/instances/%s/slots/%s", inst.Identifier, uuid.New()), nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestSlots_Destroy_InvalidSlotUUID(t *testing.T) {
	reg := instance.NewRegistry()
	sh := handler.NewSlots(reg)
	router := mountSlots(handler.NewInstances(reg, instance.DefaultMaxSlots), sh)
	inst := addTestInstance(t, reg)

	req := httptest.NewRequest(http.MethodDelete,
		fmt.Sprintf("/instances/%s/slots/not-a-uuid", inst.Identifier), nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}
