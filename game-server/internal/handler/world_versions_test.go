package handler_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/handler"
	"github.com/delve-mmo/game-server/internal/instance"
)

func postExpire(t *testing.T, reg *instance.Registry, worldVersionID, body string) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	r.Post("/world-versions/{worldVersionID}/expire", handler.NewWorldVersions(reg).Expire)
	req := httptest.NewRequest(http.MethodPost, "/world-versions/"+worldVersionID+"/expire", bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestWorldVersionsExpire_SetsExpiryOnMatchingInstancesOnly(t *testing.T) {
	reg := instance.NewRegistry()
	router := mountRequest(newSlotsHandler(reg, 200))
	require.Equal(t, http.StatusCreated, postRequest(t, router, worldRequest(nil)).Code)
	require.Equal(t, http.StatusCreated, postRequest(t, router, worldRequest(map[string]any{
		"character_name": "Brego", "instance_key": "world:8", "world_version_id": "wv-4",
	})).Code)
	for _, inst := range reg.List() {
		t.Cleanup(inst.Stop)
	}

	rec := postExpire(t, reg, "wv-3", `{"expires_at":"2030-01-02T03:04:05Z"}`)

	require.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"instances_updated":1}`, rec.Body.String())
	for _, inst := range reg.List() {
		if inst.WorldVersionID == "wv-3" {
			assert.Equal(t, time.Date(2030, 1, 2, 3, 4, 5, 0, time.UTC), inst.ExpiresAt().UTC())
		} else {
			assert.True(t, inst.ExpiresAt().IsZero())
		}
	}
}

func TestWorldVersionsExpire_RequiresExpiresAt(t *testing.T) {
	rec := postExpire(t, instance.NewRegistry(), "wv-3", `{}`)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

func TestSlotsRequest_ExpiresAtSetsInstanceExpiry(t *testing.T) {
	reg := instance.NewRegistry()
	router := mountRequest(newSlotsHandler(reg, 200))

	require.Equal(t, http.StatusCreated, postRequest(t, router, worldRequest(map[string]any{"expires_at": "2030-01-02T03:04:05Z"})).Code)
	inst := onlyInstance(t, reg)
	t.Cleanup(inst.Stop)
	assert.Equal(t, time.Date(2030, 1, 2, 3, 4, 5, 0, time.UTC), inst.ExpiresAt().UTC())
}
