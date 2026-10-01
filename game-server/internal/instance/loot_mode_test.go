package instance_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
	"github.com/delve-mmo/game-server/internal/railsclient"
)

func TestFireLootAward_DirectModeNeverCallsRails(t *testing.T) {
	called := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusCreated)
	}))
	t.Cleanup(server.Close)

	inst := makeInstance()
	inst.Mode = instance.ModeDirect
	inst.RailsClient = railsclient.New(server.URL, "token")
	slot, err := inst.AddSlot("Aldric", "42", puncherClass, nil, nil)
	require.NoError(t, err)

	claim := &instancestate.LootClaim{ClaimedBy: slot.CharacterUnitID, Result: make(chan instancestate.LootResult, 1)}
	inst.FireLootAwardForTest(context.Background(), instancestate.PendingLootClaim{
		TargetUnitID: uuid.New(),
		Claim:        claim,
		Item:         instanceconfig.Item{Identifier: "sword"},
	})

	assert.Equal(t, instancestate.LootResult{NotPersisted: true}, <-claim.Result)
	assert.False(t, called)
}

func TestSweepLootClaims_NotPersistedReportsTheReason(t *testing.T) {
	claimer, npc := uuid.New(), uuid.New()
	claim := &instancestate.LootClaim{ClaimedBy: claimer, Result: make(chan instancestate.LootResult, 1)}
	claim.Result <- instancestate.LootResult{NotPersisted: true}
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{
		npc: {LootItems: []instancestate.PendingLootItem{{
			Item:   instanceconfig.Item{Identifier: "sword"},
			Claim:  claim,
			Claims: []instancestate.CharacterLootClaim{{CharacterUnitID: claimer, State: instancestate.LootClaimStateLocked}},
		}}},
	}}

	instance.SweepLootClaimsForTest(state)

	require.Len(t, state.PendingLootFailures, 1)
	assert.Equal(t, instancestate.LootFailureNotPersisted, state.PendingLootFailures[0].Reason)
	assert.Len(t, state.Units[npc].LootItems, 1, "the item stays lootable")
}
