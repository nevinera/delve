package command_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func TestAddThreat_AccumulatesOnAnNPCAndIgnoresPlayers(t *testing.T) {
	npc := &instancestate.UnitState{ZoneUnitIdentifier: "g1"}
	player := &instancestate.UnitState{ZoneUnitIdentifier: "player:Alice"}
	attacker := uuid.New()

	command.AddThreat(npc, attacker, 5)
	command.AddThreat(npc, attacker, 7)
	command.AddThreat(npc, attacker, 0)
	command.AddThreat(player, attacker, 9)

	assert.Equal(t, 12.0, npc.Behavior.Threat[attacker])
	assert.Nil(t, player.Behavior.Threat)
}
