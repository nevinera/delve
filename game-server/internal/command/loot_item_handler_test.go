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
		LootItems: []instanceconfig.Item{
			{Identifier: "sword", Name: "Sword", Slot: "main_hand", Ilvl: 100},
			{Identifier: "helm", Name: "Helm", Slot: "head", Ilvl: 100},
		},
	}
	return state, playerID, targetID
}

func TestLootItemHandler_RemovesItemAtIndex(t *testing.T) {
	state, playerID, targetID := makeLootState()
	h := command.LootItemHandler{}
	err := h.Handle(playerID, command.LootItemPayload{TargetUnitID: targetID, ItemIndex: 0}, state)
	require.NoError(t, err)
	assert.Len(t, state.Units[targetID].LootItems, 1)
	assert.Equal(t, "helm", state.Units[targetID].LootItems[0].Identifier)
}

func TestLootItemHandler_RemovesLastItem(t *testing.T) {
	state, playerID, targetID := makeLootState()
	h := command.LootItemHandler{}
	err := h.Handle(playerID, command.LootItemPayload{TargetUnitID: targetID, ItemIndex: 1}, state)
	require.NoError(t, err)
	assert.Len(t, state.Units[targetID].LootItems, 1)
	assert.Equal(t, "sword", state.Units[targetID].LootItems[0].Identifier)
}

func TestLootItemHandler_NoopsOnOutOfBoundsIndex(t *testing.T) {
	state, playerID, targetID := makeLootState()
	h := command.LootItemHandler{}
	_ = h.Handle(playerID, command.LootItemPayload{TargetUnitID: targetID, ItemIndex: 5}, state)
	assert.Len(t, state.Units[targetID].LootItems, 2)
}

func TestLootItemHandler_NoopsOnAliveTarget(t *testing.T) {
	state, playerID, _ := makeLootState()
	aliveID := uuid.New()
	state.Units[aliveID] = &instancestate.UnitState{
		Status:    instancestate.UnitStatusIdle,
		LootItems: []instanceconfig.Item{{Identifier: "sword", Name: "Sword", Slot: "main_hand", Ilvl: 100}},
	}
	h := command.LootItemHandler{}
	_ = h.Handle(playerID, command.LootItemPayload{TargetUnitID: aliveID, ItemIndex: 0}, state)
	assert.Len(t, state.Units[aliveID].LootItems, 1)
}

func TestLootItemHandler_NoopsOnMissingTarget(t *testing.T) {
	state, playerID, _ := makeLootState()
	h := command.LootItemHandler{}
	_ = h.Handle(playerID, command.LootItemPayload{TargetUnitID: uuid.New(), ItemIndex: 0}, state)
	// no panic, state unchanged
}

func TestLootItemHandler_Type(t *testing.T) {
	assert.Equal(t, "loot_item", command.LootItemHandler{}.Type())
}

func TestLootItemHandler_NotDeduped(t *testing.T) {
	assert.False(t, command.LootItemHandler{}.Deduplicate())
}

// Ensure the handler is exercised through the processor pipeline.
func TestLootItem_ViaProcessor(t *testing.T) {
	state, playerID, targetID := makeLootState()
	p := command.NewCommandProcessor()
	p.Register(command.LootItemHandler{})
	p.Process([]command.Command{
		{UnitID: playerID, ReceivedAt: time.Now(), Payload: command.LootItemPayload{TargetUnitID: targetID, ItemIndex: 0}},
	}, state)
	assert.Len(t, state.Units[targetID].LootItems, 1)
}
