package command_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func attackingStateWithTarget(playerID, targetID uuid.UUID, playerX, playerY, targetX, targetY float64) *instancestate.InstanceState {
	state := stateWithPlayerAndTarget(playerID, targetID, playerX, playerY, targetX, targetY)
	state.Units[playerID].Attacking = true
	return state
}

func TestBasicAttackHandler_Type(t *testing.T) {
	assert.Equal(t, "basic_attack", command.BasicAttackHandler{}.Type())
}

func TestBasicAttackHandler_DoesNotDeduplicate(t *testing.T) {
	assert.False(t, command.BasicAttackHandler{}.Deduplicate())
}

func TestBasicAttackHandler_MissingUnitIsNoOp(t *testing.T) {
	require.NoError(t, command.BasicAttackHandler{}.Handle(uuid.New(), command.BasicAttackPayload{}, emptyState()))
}

func TestBasicAttackHandler_DeadPlayerIsNoOp(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
	state.Units[playerID].Status = instancestate.UnitStatusDead
	before := state.Units[targetID].Health

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestBasicAttackHandler_NotAttackingIsNoOp(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
	state.Units[playerID].Attacking = false
	before := state.Units[targetID].Health

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestBasicAttackHandler_NoTargetIsNoOp(t *testing.T) {
	unitID := uuid.New()
	state := stateWithUnit(unitID)
	state.Units[unitID].Attacking = true

	require.NoError(t, command.BasicAttackHandler{}.Handle(unitID, command.BasicAttackPayload{}, state))
}

func TestBasicAttackHandler_DeadTargetIsNoOp(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
	state.Units[targetID].Status = instancestate.UnitStatusDead
	before := state.Units[targetID].Health

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestBasicAttackHandler_OutOfRangeIsNoOp(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 10, 0) // 10ft away, range is 5ft
	before := state.Units[targetID].Health

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestBasicAttackHandler_BlockedBySwingTimer(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
	state.Units[playerID].NextBasicAttackAt = time.Now().Add(time.Minute)
	before := state.Units[targetID].Health

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestBasicAttackHandler_DamagesTargetAndSetsSwingTimer(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
	before := state.Units[targetID].Health

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, state))

	assert.Less(t, state.Units[targetID].Health, before)
	assert.True(t, state.Units[playerID].NextBasicAttackAt.After(time.Now()))
}

func TestBasicAttackHandler_KillClearsAttackerTargetAndAttacking(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
	state.Units[targetID].Health = 1
	state.Units[targetID].Hostility = "hostile"

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, state))

	assert.Equal(t, instancestate.UnitStatusDead, state.Units[targetID].Status)
	assert.Nil(t, state.Units[playerID].Target)
	assert.False(t, state.Units[playerID].Attacking)
}
