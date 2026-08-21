package instance_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/railsclient"
)

func TestRefreshEquippedItems_UpdatesSlotAndRecomputesStats(t *testing.T) {
	fetched := map[string]instanceconfig.EquippedItem{
		"head": {Identifier: "helm-of-doom", Stats: instanceconfig.ItemStats{Strength: 25}},
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(fetched)
	}))
	t.Cleanup(srv.Close)

	inst := makeInstance()
	inst.RailsClient = railsclient.New(srv.URL, "token")
	slot, err := inst.AddSlot("Aldric", "42", puncherClass, nil, map[string]instanceconfig.EquippedItem{
		"head": {Stats: instanceconfig.ItemStats{Strength: 10}},
	})
	require.NoError(t, err)

	inst.RefreshEquippedItems(context.Background(), slot.CharacterUnitID)

	assert.Equal(t, fetched, slot.EquippedItems)
	assert.Equal(t, instanceconfig.ItemStats{Strength: 25}, slot.Stats)
}

func TestRefreshEquippedItems_NilRailsClient_NoOp(t *testing.T) {
	inst := makeInstance()
	original := map[string]instanceconfig.EquippedItem{
		"head": {Stats: instanceconfig.ItemStats{Strength: 10}},
	}
	slot, err := inst.AddSlot("Aldric", "42", puncherClass, nil, original)
	require.NoError(t, err)

	inst.RefreshEquippedItems(context.Background(), slot.CharacterUnitID)

	assert.Equal(t, original, slot.EquippedItems)
	assert.Equal(t, instanceconfig.ItemStats{Strength: 10}, slot.Stats)
}

func TestRefreshEquippedItems_UnknownUnitID_NoOp(t *testing.T) {
	inst := makeInstance()
	inst.RailsClient = railsclient.New("http://example.invalid", "token")

	assert.NotPanics(t, func() {
		inst.RefreshEquippedItems(context.Background(), uuid.New())
	})
}

func TestRefreshEquippedItems_RailsError_LeavesSlotUnchanged(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	inst := makeInstance()
	inst.RailsClient = railsclient.New(srv.URL, "token")
	original := map[string]instanceconfig.EquippedItem{
		"head": {Stats: instanceconfig.ItemStats{Strength: 10}},
	}
	slot, err := inst.AddSlot("Aldric", "42", puncherClass, nil, original)
	require.NoError(t, err)

	inst.RefreshEquippedItems(context.Background(), slot.CharacterUnitID)

	assert.Equal(t, original, slot.EquippedItems)
	assert.Equal(t, instanceconfig.ItemStats{Strength: 10}, slot.Stats)
}
