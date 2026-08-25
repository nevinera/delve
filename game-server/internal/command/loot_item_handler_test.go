package command_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func makeLootState() (*instancestate.InstanceState, uuid.UUID, uuid.UUID) {
	state := &instancestate.InstanceState{
		Units: make(map[uuid.UUID]*instancestate.UnitState),
	}
	playerID := uuid.New()
	targetID := uuid.New()
	state.Units[playerID] = &instancestate.UnitState{Status: instancestate.UnitStatusIdle}
	state.Units[targetID] = &instancestate.UnitState{
		Status: instancestate.UnitStatusDead,
		LootItems: []instancestate.PendingLootItem{
			{ClaimID: uuid.New(), Item: instanceconfig.Item{Identifier: "sword", Name: "Sword", Slot: "main_hand", Elvl: 100}},
			{ClaimID: uuid.New(), Item: instanceconfig.Item{Identifier: "helm", Name: "Helm", Slot: "head", Elvl: 100}},
		},
	}
	return state, playerID, targetID
}

func TestLootItemHandler_MarksItemClaimed(t *testing.T) {
	state, playerID, targetID := makeLootState()
	h := command.LootItemHandler{}
	err := h.Handle(playerID, command.LootItemPayload{TargetUnitID: targetID, ItemIndex: 0}, state)
	require.NoError(t, err)
	item := state.Units[targetID].LootItems[0]
	require.NotNil(t, item.Claim)
	assert.Equal(t, playerID, item.Claim.ClaimedBy)
	assert.NotNil(t, item.Claim.Result)
}

func TestLootItemHandler_AppendsToPendingClaims(t *testing.T) {
	state, playerID, targetID := makeLootState()
	h := command.LootItemHandler{}
	err := h.Handle(playerID, command.LootItemPayload{TargetUnitID: targetID, ItemIndex: 0}, state)
	require.NoError(t, err)
	require.Len(t, state.PendingLootClaims, 1)
	claim := state.PendingLootClaims[0]
	assert.Equal(t, targetID, claim.TargetUnitID)
	assert.Equal(t, "sword", claim.Item.Identifier)
	assert.Equal(t, state.Units[targetID].LootItems[0].Claim, claim.Claim)
}

func TestLootItemHandler_NoopsIfAlreadyClaimed(t *testing.T) {
	state, playerID, targetID := makeLootState()
	existing := &instancestate.LootClaim{ClaimedBy: uuid.New(), Result: make(chan instancestate.LootResult, 1)}
	state.Units[targetID].LootItems[0].Claim = existing
	h := command.LootItemHandler{}
	_ = h.Handle(playerID, command.LootItemPayload{TargetUnitID: targetID, ItemIndex: 0}, state)
	assert.Empty(t, state.PendingLootClaims)
	assert.Equal(t, existing, state.Units[targetID].LootItems[0].Claim)
}

func TestLootItemHandler_NoopsOnOutOfBoundsIndex(t *testing.T) {
	state, playerID, targetID := makeLootState()
	h := command.LootItemHandler{}
	_ = h.Handle(playerID, command.LootItemPayload{TargetUnitID: targetID, ItemIndex: 5}, state)
	assert.Empty(t, state.PendingLootClaims)
}

func TestLootItemHandler_NoopsOnAliveTarget(t *testing.T) {
	state, playerID, _ := makeLootState()
	aliveID := uuid.New()
	state.Units[aliveID] = &instancestate.UnitState{
		Status:    instancestate.UnitStatusIdle,
		LootItems: []instancestate.PendingLootItem{{ClaimID: uuid.New(), Item: instanceconfig.Item{Identifier: "sword", Name: "Sword", Slot: "main_hand", Elvl: 100}}},
	}
	h := command.LootItemHandler{}
	_ = h.Handle(playerID, command.LootItemPayload{TargetUnitID: aliveID, ItemIndex: 0}, state)
	assert.Nil(t, state.Units[aliveID].LootItems[0].Claim)
}

func TestLootItemHandler_NoopsOnMissingTarget(t *testing.T) {
	state, playerID, _ := makeLootState()
	h := command.LootItemHandler{}
	_ = h.Handle(playerID, command.LootItemPayload{TargetUnitID: uuid.New(), ItemIndex: 0}, state)
	assert.Empty(t, state.PendingLootClaims)
}

func TestLootItemHandler_Type(t *testing.T) {
	assert.Equal(t, "loot_item", command.LootItemHandler{}.Type())
}

func TestLootItemHandler_NotDeduped(t *testing.T) {
	assert.False(t, command.LootItemHandler{}.Deduplicate())
}

func TestLootItemHandler_SetsLockedForMeOnClaimer(t *testing.T) {
	state, playerID, targetID := makeLootState()
	otherID := uuid.New()
	state.Units[targetID].LootItems[0].Claims = []instancestate.CharacterLootClaim{
		{CharacterUnitID: playerID, State: instancestate.LootClaimStateAvailable},
		{CharacterUnitID: otherID, State: instancestate.LootClaimStateAvailable},
	}

	h := command.LootItemHandler{}
	require.NoError(t, h.Handle(playerID, command.LootItemPayload{TargetUnitID: targetID, ItemIndex: 0}, state))

	claims := state.Units[targetID].LootItems[0].Claims
	for _, c := range claims {
		if c.CharacterUnitID == playerID {
			assert.Equal(t, instancestate.LootClaimStateLockedForMe, c.State)
		} else {
			assert.Equal(t, instancestate.LootClaimStateLocked, c.State)
		}
	}
}

func TestLootItemHandler_DoesNotLockNonAvailableClaims(t *testing.T) {
	state, playerID, targetID := makeLootState()
	upgradeID := uuid.New()
	state.Units[targetID].LootItems[0].Claims = []instancestate.CharacterLootClaim{
		{CharacterUnitID: playerID, State: instancestate.LootClaimStateAvailable},
		{CharacterUnitID: upgradeID, State: instancestate.LootClaimStateUpgrade},
	}

	h := command.LootItemHandler{}
	require.NoError(t, h.Handle(playerID, command.LootItemPayload{TargetUnitID: targetID, ItemIndex: 0}, state))

	claims := state.Units[targetID].LootItems[0].Claims
	for _, c := range claims {
		if c.CharacterUnitID == upgradeID {
			assert.Equal(t, instancestate.LootClaimStateUpgrade, c.State, "non-available claims should not become locked")
		}
	}
}

func TestLootItem_ViaProcessor(t *testing.T) {
	state, playerID, targetID := makeLootState()
	p := command.NewCommandProcessor()
	p.Register(command.LootItemHandler{})
	p.Process([]command.Command{
		{UnitID: playerID, ReceivedAt: time.Now(), Payload: command.LootItemPayload{TargetUnitID: targetID, ItemIndex: 0}},
	}, state)
	require.Len(t, state.PendingLootClaims, 1)
	assert.NotNil(t, state.Units[targetID].LootItems[0].Claim)
}
