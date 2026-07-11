package command_test

import (
	"math"
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
	facingDeg := math.Atan2(targetX-playerX, targetY-playerY) * 180 / math.Pi
	state.Units[playerID].Position = instanceconfig.Position{X: playerX, Y: playerY, Angle: facingDeg}
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

func TestUsePowerHandler_DeadPlayerIsNoOp(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 3, 0)
	state.Units[playerID].Status = instancestate.UnitStatusDead
	before := state.Units[targetID].Health

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), state))

	assert.Equal(t, before, state.Units[targetID].Health)
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

func TestUsePowerHandler_SetsDeadStatusAtZeroHealth(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
	state.Units[targetID].Health = 1.0

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), state))

	assert.Equal(t, instancestate.UnitStatusDead, state.Units[targetID].Status)
}

func TestUsePowerHandler_FrontalBlocksWhenNotFacing(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	// Target is directly north, player facing south (180°) — outside 75° arc.
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 5)
	state.Units[playerID].Position.Angle = 180
	before := state.Units[targetID].Health

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestUsePowerHandler_FrontalAllowsWhenFacing(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	// Target is directly north, player facing north (0°) — within 75° arc.
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 5)
	state.Units[playerID].Position.Angle = 0
	before := state.Units[targetID].Health

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), state))

	assert.Less(t, state.Units[targetID].Health, before)
}

func TestUsePowerHandler_NonFrontalIgnoresFacing(t *testing.T) {
	f := false
	playerID, targetID := uuid.New(), uuid.New()
	// Target is directly north, player facing south — but power is non-frontal.
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 5)
	state.Units[playerID].Position.Angle = 180
	payload := punchPower()
	payload.Power.Frontal = &f
	before := state.Units[targetID].Health

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, payload, state))

	assert.Less(t, state.Units[targetID].Health, before)
}

func recoverPower() command.UsePowerPayload {
	amount := instanceconfig.ValueRange{20.0, 20.0}
	return command.UsePowerPayload{
		Power: instanceconfig.Power{
			Name:           "Recover",
			GlobalCooldown: 1.5,
			Cooldown:       10.0,
			Effects: []instanceconfig.PowerEffect{
				{Type: "heal", Affects: "self", Amount: &amount},
			},
		},
	}
}

func stateWithInjuredPlayer(playerID uuid.UUID) *instancestate.InstanceState {
	state := stateWithUnit(playerID)
	state.Units[playerID].Health = 40.0
	state.Units[playerID].MaxHealth = 100.0
	return state
}

func TestUsePowerHandler_HealsSelf(t *testing.T) {
	playerID := uuid.New()
	state := stateWithInjuredPlayer(playerID)

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, recoverPower(), state))

	assert.Equal(t, 60.0, state.Units[playerID].Health)
}

func TestUsePowerHandler_HealDoesNotExceedMaxHealth(t *testing.T) {
	playerID := uuid.New()
	state := stateWithInjuredPlayer(playerID)
	state.Units[playerID].Health = 90.0 // 20 heal would overshoot 100

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, recoverPower(), state))

	assert.Equal(t, 100.0, state.Units[playerID].Health)
}

func TestUsePowerHandler_HealWorksWithoutTarget(t *testing.T) {
	playerID := uuid.New()
	state := stateWithInjuredPlayer(playerID)
	// No target set — self-heal should still fire.

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, recoverPower(), state))

	assert.Greater(t, state.Units[playerID].Health, 40.0)
}

func TestUsePowerHandler_HealSetsGCD(t *testing.T) {
	playerID := uuid.New()
	state := stateWithInjuredPlayer(playerID)
	before := time.Now()

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, recoverPower(), state))

	assert.True(t, state.Units[playerID].GlobalCooldownEndsAt.After(before.Add(time.Second)))
}

func TestUsePowerHandler_HealSetsPowerCooldown(t *testing.T) {
	playerID := uuid.New()
	state := stateWithInjuredPlayer(playerID)
	before := time.Now()

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, recoverPower(), state))

	cd := state.Units[playerID].PowerCooldowns["Recover"]
	assert.True(t, cd.After(before.Add(9*time.Second)))
}

func TestUsePowerHandler_PowerCooldownBlocksRepeatUse(t *testing.T) {
	playerID := uuid.New()
	state := stateWithInjuredPlayer(playerID)

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, recoverPower(), state))
	// Manually expire GCD so only the per-power cooldown is blocking.
	state.Units[playerID].GlobalCooldownEndsAt = time.Time{}
	afterFirst := state.Units[playerID].Health

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, recoverPower(), state))

	assert.Equal(t, afterFirst, state.Units[playerID].Health)
}

func TestUsePowerHandler_NoCooldownFieldDoesNotSetPowerCooldown(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), state))

	assert.Empty(t, state.Units[playerID].PowerCooldowns)
}

func TestUsePowerHandler_ClearsTargetOnDeath(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
	state.Units[targetID].Health = 1.0
	// Give the target its own target to simulate a goblin that had aggro
	state.Units[targetID].Target = &playerID

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), state))

	assert.Nil(t, state.Units[targetID].Target)
}
