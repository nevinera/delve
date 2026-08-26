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
		"main_hand": {Identifier: "helm-of-doom", Slot: "main_hand", PrimaryStat: strPtr("strength"), SecondaryStats: []string{}},
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(fetched)
	}))
	t.Cleanup(srv.Close)

	inst := makeInstance()
	inst.RailsClient = railsclient.New(srv.URL, "token")
	slot, err := inst.AddSlot("Aldric", "42", puncherClass, nil, map[string]instanceconfig.EquippedItem{
		"chest": {Slot: "chest", PrimaryStat: strPtr("strength"), SecondaryStats: []string{}},
	})
	require.NoError(t, err)
	chestStrength := slot.Stats["strength"]

	inst.RefreshEquippedItems(context.Background(), slot.CharacterUnitID)

	assert.Equal(t, fetched, slot.EquippedItems)
	require.Contains(t, slot.Stats, "strength")
	assert.NotEqual(t, chestStrength, slot.Stats["strength"])
}

func TestRefreshEquippedItems_NilRailsClient_NoOp(t *testing.T) {
	inst := makeInstance()
	original := map[string]instanceconfig.EquippedItem{
		"head": {Slot: "head", PrimaryStat: strPtr("strength"), SecondaryStats: []string{}},
	}
	slot, err := inst.AddSlot("Aldric", "42", puncherClass, nil, original)
	require.NoError(t, err)
	originalStats := slot.Stats

	inst.RefreshEquippedItems(context.Background(), slot.CharacterUnitID)

	assert.Equal(t, original, slot.EquippedItems)
	assert.Equal(t, originalStats, slot.Stats)
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
		"head": {Slot: "head", PrimaryStat: strPtr("strength"), SecondaryStats: []string{}},
	}
	slot, err := inst.AddSlot("Aldric", "42", puncherClass, nil, original)
	require.NoError(t, err)
	originalStats := slot.Stats

	inst.RefreshEquippedItems(context.Background(), slot.CharacterUnitID)

	assert.Equal(t, original, slot.EquippedItems)
	assert.Equal(t, originalStats, slot.Stats)
}
