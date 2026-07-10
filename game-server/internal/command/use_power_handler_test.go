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

func punchPower() command.UsePowerPayload {
	amount := instanceconfig.ValueRange{8.0, 14.0}
	rng := instanceconfig.ZeroBasedValueRange{0, 5.0}
	return command.UsePowerPayload{
		Power: instanceconfig.Power{
			GlobalCooldown: 1.5,
			Effects: []instanceconfig.PowerEffect{
				{Type: "harm", Amount: &amount, Range: &rng},
			},
		},
	}
}

func stateWithPlayerAndTarget(playerID, targetID uuid.UUID, playerX, playerY, targetX, targetY float64) *instancestate.InstanceState {
	state := stateWithUnit(playerID)
	state.Units[playerID].Position = instanceconfig.Position{X: playerX, Y: playerY}
	targetUUID := targetID
	state.Units[playerID].Target = &targetUUID
	state.Units[targetID] = &instancestate.UnitState{
		ZoneUnitIdentifier: "goblin_1",
		Position:           instanceconfig.Position{X: targetX, Y: targetY},
		Health:             50.0,
		Status:             instancestate.UnitStatusIdle,
	}
	return state
}

func TestUsePowerHandler_Type(t *testing.T) {
	assert.Equal(t, "use_power", command.UsePowerHandler{}.Type())
}

func TestUsePowerHandler_DoesNotDeduplicate(t *testing.T) {
	assert.False(t, command.UsePowerHandler{}.Deduplicate())
}

func TestUsePowerHandler_MissingUnitIsNoOp(t *testing.T) {
	require.NoError(t, command.UsePowerHandler{}.Handle(uuid.New(), punchPower(), emptyState()))
}

func TestUsePowerHandler_NoTargetIsNoOp(t *testing.T) {
	unitID := uuid.New()
	state := stateWithUnit(unitID)

	require.NoError(t, command.UsePowerHandler{}.Handle(unitID, punchPower(), state))
}

func TestUsePowerHandler_DeadTargetIsNoOp(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 3, 0)
	state.Units[targetID].Status = instancestate.UnitStatusDead
	before := state.Units[targetID].Health

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestUsePowerHandler_OutOfRangeIsNoOp(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 10, 0) // 10ft away, range is 5ft
	before := state.Units[targetID].Health

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestUsePowerHandler_DamagesTargetInRange(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 4, 0) // 4ft away, within 5ft range
	before := state.Units[targetID].Health

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), state))

	assert.Less(t, state.Units[targetID].Health, before)
}

func TestUsePowerHandler_DamageWithinPowerAmountRange(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
	before := state.Units[targetID].Health

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), state))

	damage := before - state.Units[targetID].Health
	assert.GreaterOrEqual(t, damage, 8.0)
	assert.LessOrEqual(t, damage, 14.0)
}

func TestUsePowerHandler_SetsGlobalCooldown(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)

	before := time.Now()
	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), state))

	gcd := state.Units[playerID].GlobalCooldownEndsAt
	assert.True(t, gcd.After(before.Add(time.Second)))
}

func TestUsePowerHandler_GCDBlocksRepeatUse(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), state))
	afterFirst := state.Units[targetID].Health

	// Second use should be blocked by GCD.
	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), state))

	assert.Equal(t, afterFirst, state.Units[targetID].Health)
}

func TestUsePowerHandler_HealthDoesNotGoBelowZero(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
	state.Units[targetID].Health = 1.0

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), state))

	assert.Equal(t, 0.0, state.Units[targetID].Health)
}
