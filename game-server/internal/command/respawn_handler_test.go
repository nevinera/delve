package command_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func deadUnitAtSpawn() (*instancestate.UnitState, uuid.UUID, *instancestate.InstanceState) {
	id := uuid.New()
	spawnPos := instanceconfig.Position{X: 10, Y: 20}
	targetID := uuid.New()
	unit := &instancestate.UnitState{
		ZoneUnitIdentifier: "player:Aldric",
		Health:             0,
		MaxHealth:          100,
		SpawnPoint:         spawnPos,
		Position:           instanceconfig.Position{X: 55, Y: 66},
		Status:             instancestate.UnitStatusDead,
		Target:             &targetID,
	}
	state := &instancestate.InstanceState{
		Units: map[uuid.UUID]*instancestate.UnitState{id: unit},
	}
	return unit, id, state
}

func TestRespawnHandler_Type(t *testing.T) {
	assert.Equal(t, "respawn", command.RespawnHandler{}.Type())
}

func TestRespawnHandler_Deduplicates(t *testing.T) {
	assert.True(t, command.RespawnHandler{}.Deduplicate())
}

func TestRespawnHandler_ResetsDeadUnit(t *testing.T) {
	unit, id, state := deadUnitAtSpawn()

	require.NoError(t, command.RespawnHandler{}.Handle(id, command.RespawnPayload{}, state))

	assert.Equal(t, instancestate.UnitStatusIdle, unit.Status)
	assert.Equal(t, unit.MaxHealth, unit.Health)
	assert.Equal(t, unit.SpawnPoint.X, unit.Position.X)
	assert.Equal(t, unit.SpawnPoint.Y, unit.Position.Y)
	assert.Nil(t, unit.Target)
}

func TestRespawnHandler_AliveUnitIsNoOp(t *testing.T) {
	unit, id, state := deadUnitAtSpawn()
	unit.Status = instancestate.UnitStatusIdle
	unit.Health = 42

	require.NoError(t, command.RespawnHandler{}.Handle(id, command.RespawnPayload{}, state))

	assert.Equal(t, 42.0, unit.Health, "alive unit should not be touched")
}

func TestRespawnHandler_MissingUnitIsNoOp(t *testing.T) {
	assert.NoError(t, command.RespawnHandler{}.Handle(uuid.New(), command.RespawnPayload{}, emptyState()))
}
