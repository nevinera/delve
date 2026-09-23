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

// retryUntilHit rebuilds and re-attacks (via build, a fresh-state factory)
// until a swing actually lands, so tests that need a hit aren't flaky over
// the 5% miss chance - P(200 consecutive misses) is astronomically small.
func retryUntilHit(t *testing.T, playerID, targetID uuid.UUID, zone instanceconfig.Zone, build func() *instancestate.InstanceState) *instancestate.InstanceState {
	t.Helper()
	for i := 0; i < 200; i++ {
		state := build()
		before := state.Units[targetID].Health
		require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, zone, state))
		if state.Units[targetID].Health < before {
			return state
		}
	}
	t.Fatal("basic attack missed 200 times in a row - miss chance may be miscalibrated")
	return nil
}

// retryUntilMiss is retryUntilHit's mirror: rebuilds and re-attacks until a
// swing actually misses (health unchanged), so a test asserting behavior on
// a miss isn't flaky over the 95% hit chance.
func retryUntilMiss(t *testing.T, playerID, targetID uuid.UUID, zone instanceconfig.Zone, build func() *instancestate.InstanceState) *instancestate.InstanceState {
	t.Helper()
	for i := 0; i < 200; i++ {
		state := build()
		before := state.Units[targetID].Health
		require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, zone, state))
		if state.Units[targetID].Health == before {
			return state
		}
	}
	t.Fatal("basic attack hit 200 times in a row - miss chance may be miscalibrated")
	return nil
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
	zone := wallZone(instanceconfig.Location{X: 20, Y: -5}, instanceconfig.Location{X: 20, Y: 5})

	retryUntilHit(t, playerID, targetID, zone, func() *instancestate.InstanceState {
		return attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
	})
}

func TestBasicAttackHandler_BlockedBySwingTimer(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
	state.Units[playerID].NextBasicAttackAt = time.Now().Add(time.Minute)
	before := state.Units[targetID].Health

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, instanceconfig.Zone{}, state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestBasicAttackHandler_HeldWhileCasting(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
	swingDueAt := time.Now().Add(-time.Second) // already due
	state.Units[playerID].NextBasicAttackAt = swingDueAt
	state.Units[playerID].Casting = &instancestate.CastState{
		Power:     instanceconfig.Power{Name: "Fireball"},
		StartedAt: time.Now(),
		EndsAt:    time.Now().Add(2 * time.Second),
	}
	before := state.Units[targetID].Health

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, instanceconfig.Zone{}, state))

	assert.Equal(t, before, state.Units[targetID].Health)
	// Held, not reset - the swing is still due the instant casting ends.
	assert.Equal(t, swingDueAt, state.Units[playerID].NextBasicAttackAt)
}

func TestBasicAttackHandler_FiresImmediatelyAfterCastEnds(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()

	state := retryUntilHit(t, playerID, targetID, instanceconfig.Zone{}, func() *instancestate.InstanceState {
		s := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
		s.Units[playerID].NextBasicAttackAt = time.Now().Add(-time.Second) // already due
		s.Units[playerID].Casting = nil                                    // cast just ended this tick
		return s
	})

	assert.True(t, state.Units[playerID].NextBasicAttackAt.After(time.Now()))
}

func TestBasicAttackHandler_DamagesTargetAndSetsSwingTimer(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()

	state := retryUntilHit(t, playerID, targetID, instanceconfig.Zone{}, func() *instancestate.InstanceState {
		return attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
	})

	assert.True(t, state.Units[playerID].NextBasicAttackAt.After(time.Now()))

	require.Len(t, state.PendingCombatEvents, 1)
	assert.Equal(t, playerID.String(), state.PendingCombatEvents[0].AttackerID)
	assert.Equal(t, targetID.String(), state.PendingCombatEvents[0].TargetID)
	assert.Equal(t, "Basic Attack", state.PendingCombatEvents[0].PowerName)
}

func TestBasicAttackHandler_SwingTimerIsConsumedEvenOnAMiss(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)

	require.NoError(t, command.BasicAttackHandler{}.Handle(playerID, command.BasicAttackPayload{}, instanceconfig.Zone{}, state))

	// Whether this particular swing hit or missed, the swing timer always
	// advances - a miss is still a swing, just one that doesn't land.
	assert.True(t, state.Units[playerID].NextBasicAttackAt.After(time.Now()))
}

func TestBasicAttackHandler_KillClearsAttackerTargetAndAttacking(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()

	state := retryUntilHit(t, playerID, targetID, instanceconfig.Zone{}, func() *instancestate.InstanceState {
		state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
		state.Units[targetID].Health = 1
		state.Units[targetID].Hostility = "hostile"
		return state
	})

	assert.Equal(t, instancestate.UnitStatusDead, state.Units[targetID].Status)
	assert.Nil(t, state.Units[playerID].Target)
	assert.False(t, state.Units[playerID].Attacking)
}

func TestBasicAttackHandler_EngagesIdleHostileTargetOnHit(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()

	state := retryUntilHit(t, playerID, targetID, instanceconfig.Zone{}, func() *instancestate.InstanceState {
		state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
		state.Units[targetID].Hostility = "hostile"
		return state
	})

	// The target should notice and fight back immediately, even though it
	// was never within its own aggro radius of the player - that's the point
	// of this test (no aggro radius is modeled here at all).
	assert.Equal(t, instancestate.UnitStatusEngaged, state.Units[targetID].Status)
	require.NotNil(t, state.Units[targetID].Target)
	assert.Equal(t, playerID, *state.Units[targetID].Target)
	assert.True(t, state.Units[targetID].Attacking)
}

func TestBasicAttackHandler_EngagesIdleHostileTargetEvenOnAMiss(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()

	state := retryUntilMiss(t, playerID, targetID, instanceconfig.Zone{}, func() *instancestate.InstanceState {
		state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
		state.Units[targetID].Hostility = "hostile"
		return state
	})

	// Swinging and missing still counts as an attack - the target notices it
	// was attacked, not that it was hit.
	assert.Equal(t, instancestate.UnitStatusEngaged, state.Units[targetID].Status)
	require.NotNil(t, state.Units[targetID].Target)
	assert.Equal(t, playerID, *state.Units[targetID].Target)
	assert.True(t, state.Units[targetID].Attacking)
}

func TestBasicAttackHandler_DoesNotEngageANonHostileTargetOnHit(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()

	state := retryUntilHit(t, playerID, targetID, instanceconfig.Zone{}, func() *instancestate.InstanceState {
		state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
		state.Units[targetID].Hostility = "neutral"
		return state
	})

	assert.Equal(t, instancestate.UnitStatusIdle, state.Units[targetID].Status)
	assert.Nil(t, state.Units[targetID].Target)
}

func TestBasicAttackHandler_KillAggroesGroupedIdleUnitEvenIfItNeverAggroedItself(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	linkedID := uuid.New()
	zone := instanceconfig.Zone{
		Maps: []instanceconfig.Map{{
			Units: []instanceconfig.Unit{
				{Identifier: "goblin_1", GroupIdentifier: "pack"},
				{Identifier: "goblin_2", GroupIdentifier: "pack"},
			},
		}},
	}

	state := retryUntilHit(t, playerID, targetID, zone, func() *instancestate.InstanceState {
		state := attackingStateWithTarget(playerID, targetID, 0, 0, 3, 0)
		state.Units[targetID].Health = 1
		state.Units[targetID].Hostility = "hostile"
		// One-shot: goblin_1 dies without ever transitioning out of idle itself.
		state.Units[linkedID] = &instancestate.UnitState{
			ZoneUnitIdentifier: "goblin_2",
			Position:           instanceconfig.Position{X: 50, Y: 50},
			Health:             10,
			Status:             instancestate.UnitStatusIdle,
		}
		return state
	})

	assert.Equal(t, instancestate.UnitStatusEngaged, state.Units[linkedID].Status)
	require.NotNil(t, state.Units[linkedID].Target)
	assert.Equal(t, playerID, *state.Units[linkedID].Target)
	assert.True(t, state.Units[linkedID].Attacking)
}
