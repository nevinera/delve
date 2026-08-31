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

func attackingStateWithTarget(playerID, targetID uuid.UUID, playerX, playerY, targetX, targetY float64) *instancestate.InstanceState {
	state := stateWithPlayerAndTarget(playerID, targetID, playerX, playerY, targetX, targetY)
	state.Units[playerID].Attacking = true
	return state
}

// wallZone builds a zone with one map (matching the empty MapIdentifier used
// by the test state helpers) containing a single wall barrier.
func wallZone(a, b instanceconfig.Location) instanceconfig.Zone {
	return instanceconfig.Zone{
		Maps: []instanceconfig.Map{{
			Barriers: []instanceconfig.Barrier{{Type: "wall", Locations: []instanceconfig.Location{a, b}}},
		}},
	}
}

func TestBasicAttackHandler_Type(t *testing.T) {
	assert.Equal(t, "basic_attack", command.BasicAttackHandler{}.Type())
}

func TestBasicAttackHandler_DoesNotDeduplicate(t *testing.T) {
	assert.False(t, command.BasicAttackHandler{}.Deduplicate())
}

func TestBasicAttackHandler_MissingUnitIsNoOp(t *testing.T) {
	require.NoError(t, command.BasicAttackHandler{}.Handle(uuid.New(), command.BasicAttackPayload{}, instanceconfig.Zone{}, emptyState()))
}

func TestBasicAttackHandler_DeadPlayerIsNoOp(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
	state.Units[playerID].Status = instancestate.UnitStatusDead
	before := state.Units[targetID].Health

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, instanceconfig.Zone{}, state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestBasicAttackHandler_NotAttackingIsNoOp(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
	state.Units[playerID].Attacking = false
	before := state.Units[targetID].Health

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, instanceconfig.Zone{}, state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestBasicAttackHandler_NoTargetIsNoOp(t *testing.T) {
	unitID := uuid.New()
	state := stateWithUnit(unitID)
	state.Units[unitID].Attacking = true

	require.NoError(t, command.BasicAttackHandler{}.Handle(unitID, command.BasicAttackPayload{}, instanceconfig.Zone{}, state))
}

func TestBasicAttackHandler_DeadTargetIsNoOp(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
	state.Units[targetID].Status = instancestate.UnitStatusDead
	before := state.Units[targetID].Health

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, instanceconfig.Zone{}, state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestBasicAttackHandler_OutOfRangeIsNoOp(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 10, 0) // 10ft away, range is 5ft
	before := state.Units[targetID].Health

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, instanceconfig.Zone{}, state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestBasicAttackHandler_WallBetweenAttackerAndTargetIsNoOp(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
	zone := wallZone(instanceconfig.Location{X: 1.5, Y: -5}, instanceconfig.Location{X: 1.5, Y: 5})
	before := state.Units[targetID].Health

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, zone, state))

	assert.Equal(t, before, state.Units[targetID].Health)
	assert.True(t, state.Units[playerID].NextBasicAttackAt.IsZero()) // swing timer not consumed by a blocked attempt
}

func TestBasicAttackHandler_WallElsewhereDoesNotBlock(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
	zone := wallZone(instanceconfig.Location{X: 20, Y: -5}, instanceconfig.Location{X: 20, Y: 5})
	before := state.Units[targetID].Health

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, zone, state))

	assert.Less(t, state.Units[targetID].Health, before)
}

func TestBasicAttackHandler_BlockedBySwingTimer(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
	state.Units[playerID].NextBasicAttackAt = time.Now().Add(time.Minute)
	before := state.Units[targetID].Health

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, instanceconfig.Zone{}, state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestBasicAttackHandler_DamagesTargetAndSetsSwingTimer(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
	before := state.Units[targetID].Health

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, instanceconfig.Zone{}, state))

	assert.Less(t, state.Units[targetID].Health, before)
	assert.True(t, state.Units[playerID].NextBasicAttackAt.After(time.Now()))

	require.Len(t, state.PendingCombatEvents, 1)
	assert.Equal(t, playerID.String(), state.PendingCombatEvents[0].AttackerID)
	assert.Equal(t, targetID.String(), state.PendingCombatEvents[0].TargetID)
	assert.Equal(t, "Basic Attack", state.PendingCombatEvents[0].PowerName)
}

func TestBasicAttackHandler_KillClearsAttackerTargetAndAttacking(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
	state.Units[targetID].Health = 1
	state.Units[targetID].Hostility = "hostile"

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, instanceconfig.Zone{}, state))

	assert.Equal(t, instancestate.UnitStatusDead, state.Units[targetID].Status)
	assert.Nil(t, state.Units[playerID].Target)
	assert.False(t, state.Units[playerID].Attacking)
}
