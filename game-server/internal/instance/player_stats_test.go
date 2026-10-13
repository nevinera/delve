package instance_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func TestUpdatePlayerSpeed_AppliesSprint(t *testing.T) {
	sprinting := instancestate.ActiveStatusEffect{Status: instanceconfig.Status{Name: "Sprinting", Effects: []instanceconfig.StatusEffect{
		{Type: "stat", StatName: "movementSpeed", ModifierType: "multiply", Amount: 1.7},
	}}}
	player := &instancestate.UnitState{ZoneUnitIdentifier: "player:Aldric", Speed: instance.BasePlayerSpeed,
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{sprinting}}
	npc := &instancestate.UnitState{ZoneUnitIdentifier: "goblin_1", ActiveStatusEffects: []instancestate.ActiveStatusEffect{sprinting}}
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): player, uuid.New(): npc}}

	instance.UpdatePlayerSpeedForTest(state)
	assert.InDelta(t, instance.BasePlayerSpeed*1.7, player.Speed, 1e-9)
	assert.Zero(t, npc.Speed, "NPCs go by BaseMobSpeed, not Speed")

	player.ActiveStatusEffects = nil
	instance.UpdatePlayerSpeedForTest(state)
	assert.Equal(t, instance.BasePlayerSpeed, player.Speed, "back to normal once it ends")
}
