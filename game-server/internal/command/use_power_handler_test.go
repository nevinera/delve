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

// retryUntilPowerLands rebuilds fresh state via build, casts payload against
// targetID, and retries (up to 200x) until the target's health actually
// changes - harm effects roll the universal 5% miss chance now, and these
// tests want to observe a landed hit specifically. Returns the post-cast
// state on the landed attempt.
func retryUntilPowerLands(t *testing.T, playerID, targetID uuid.UUID, zone instanceconfig.Zone, payload command.UsePowerPayload, build func() *instancestate.InstanceState) *instancestate.InstanceState {
	t.Helper()
	for i := 0; i < 200; i++ {
		state := build()
		before := state.Units[targetID].Health

		require.NoError(t, command.UsePowerHandler{}.Handle(playerID, payload, zone, state))

		if state.Units[targetID].Health != before {
			return state
		}
	}
	t.Fatal("power missed 200 times in a row - miss chance may be miscalibrated")
	return nil
}

func TestUsePowerHandler_Type(t *testing.T) {
	assert.Equal(t, "use_power", command.UsePowerHandler{}.Type())
}

func TestUsePowerHandler_DoesNotDeduplicate(t *testing.T) {
	assert.False(t, command.UsePowerHandler{}.Deduplicate())
}

func TestUsePowerHandler_MissingUnitIsNoOp(t *testing.T) {
	require.NoError(t, command.UsePowerHandler{}.Handle(uuid.New(), punchPower(), instanceconfig.Zone{}, emptyState()))
}

func TestUsePowerHandler_DeadPlayerIsNoOp(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 3, 0)
	state.Units[playerID].Status = instancestate.UnitStatusDead
	before := state.Units[targetID].Health

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestUsePowerHandler_NoTargetIsNoOp(t *testing.T) {
	unitID := uuid.New()
	state := stateWithUnit(unitID)

	require.NoError(t, command.UsePowerHandler{}.Handle(unitID, punchPower(), instanceconfig.Zone{}, state))
}

func TestUsePowerHandler_DeadTargetIsNoOp(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 3, 0)
	state.Units[targetID].Status = instancestate.UnitStatusDead
	before := state.Units[targetID].Health

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestUsePowerHandler_OutOfRangeIsNoOp(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 10, 0) // 10ft away, range is 5ft
	before := state.Units[targetID].Health

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestUsePowerHandler_WallBetweenAttackerAndTargetIsNoOp(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 4, 0) // 4ft away, within 5ft range
	zone := wallZone(instanceconfig.Location{X: 2, Y: -5}, instanceconfig.Location{X: 2, Y: 5})
	before := state.Units[targetID].Health

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), zone, state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestUsePowerHandler_WallElsewhereDoesNotBlock(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	zone := wallZone(instanceconfig.Location{X: 20, Y: -5}, instanceconfig.Location{X: 20, Y: 5})

	retryUntilPowerLands(t, playerID, targetID, zone, punchPower(), func() *instancestate.InstanceState {
		return stateWithPlayerAndTarget(playerID, targetID, 0, 0, 4, 0) // 4ft away, within 5ft range
	})
}

func TestUsePowerHandler_DamagesTargetInRange(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()

	retryUntilPowerLands(t, playerID, targetID, instanceconfig.Zone{}, punchPower(), func() *instancestate.InstanceState {
		return stateWithPlayerAndTarget(playerID, targetID, 0, 0, 4, 0) // 4ft away, within 5ft range
	})
}

func TestUsePowerHandler_SetsAttackingOnHarmInRange(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 4, 0) // 4ft away, within 5ft range

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))

	assert.True(t, state.Units[playerID].Attacking)
}

func TestUsePowerHandler_OutOfRangeDoesNotSetAttacking(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 10, 0) // 10ft away, range is 5ft

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))

	assert.False(t, state.Units[playerID].Attacking)
}

func TestUsePowerHandler_DamageWithinPowerAmountRange(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()

	// The caster has no itemized stats, so the bonus from PowerEffectAmount
	// is 0 and the roll should land exactly in [8,14] - except a landed miss
	// (damage 0) or crit (double) skews that, so retry past either to keep
	// this a check of the plain landed-non-crit base roll range.
	for i := 0; i < 200; i++ {
		state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
		before := state.Units[targetID].Health

		require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))

		damage := before - state.Units[targetID].Health
		if damage > 0 && damage <= 14.0 {
			assert.GreaterOrEqual(t, damage, 8.0)
			return
		}
	}
	t.Fatal("punch missed or crit 200 times in a row - miss/crit chance may be miscalibrated")
}

func TestUsePowerHandler_SetsGlobalCooldown(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)

	before := time.Now()
	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))

	gcd := state.Units[playerID].GlobalCooldownEndsAt
	assert.True(t, gcd.After(before.Add(time.Second)))
}

func TestUsePowerHandler_GCDBlocksRepeatUse(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))
	afterFirst := state.Units[targetID].Health

	// Second use should be blocked by GCD.
	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))

	assert.Equal(t, afterFirst, state.Units[targetID].Health)
}

func lowHealthPlayerAndTarget(playerID, targetID uuid.UUID) func() *instancestate.InstanceState {
	return func() *instancestate.InstanceState {
		state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
		state.Units[targetID].Health = 1.0
		return state
	}
}

func TestUsePowerHandler_HealthDoesNotGoBelowZero(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()

	state := retryUntilPowerLands(t, playerID, targetID, instanceconfig.Zone{}, punchPower(), lowHealthPlayerAndTarget(playerID, targetID))

	assert.Equal(t, 0.0, state.Units[targetID].Health)
}

func TestUsePowerHandler_SetsDeadStatusAtZeroHealth(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()

	state := retryUntilPowerLands(t, playerID, targetID, instanceconfig.Zone{}, punchPower(), lowHealthPlayerAndTarget(playerID, targetID))

	assert.Equal(t, instancestate.UnitStatusDead, state.Units[targetID].Status)
}

func TestUsePowerHandler_TagsHostileTargetOnFirstDamage(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
	state.Units[targetID].Hostility = "hostile"

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))

	require.NotNil(t, state.Units[targetID].TaggedBy)
	assert.Equal(t, playerID, *state.Units[targetID].TaggedBy)
}

func TestUsePowerHandler_DoesNotRetagAlreadyTaggedTarget(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
	state.Units[targetID].Hostility = "hostile"
	firstTagger := uuid.New()
	state.Units[targetID].TaggedBy = &firstTagger

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))

	assert.Equal(t, firstTagger, *state.Units[targetID].TaggedBy)
}

func TestUsePowerHandler_DoesNotTagNonHostileTarget(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0) // target Hostility is "" (player)

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))

	assert.Nil(t, state.Units[targetID].TaggedBy)
}

func TestUsePowerHandler_FrontalBlocksWhenNotFacing(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	// Target is directly north, player facing south (180°) — outside 75° arc.
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 5)
	state.Units[playerID].Position.Angle = 180
	before := state.Units[targetID].Health

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestUsePowerHandler_FrontalAllowsWhenFacing(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()

	retryUntilPowerLands(t, playerID, targetID, instanceconfig.Zone{}, punchPower(), func() *instancestate.InstanceState {
		// Target is directly north, player facing north (0°) — within 75° arc.
		state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 5)
		state.Units[playerID].Position.Angle = 0
		return state
	})
}

func TestUsePowerHandler_NonFrontalIgnoresFacing(t *testing.T) {
	f := false
	playerID, targetID := uuid.New(), uuid.New()
	payload := punchPower()
	payload.Power.Frontal = &f

	retryUntilPowerLands(t, playerID, targetID, instanceconfig.Zone{}, payload, func() *instancestate.InstanceState {
		// Target is directly north, player facing south — but power is non-frontal.
		state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 5)
		state.Units[playerID].Position.Angle = 180
		return state
	})
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
	// The caster has no itemized stats, so the bonus from PowerEffectAmount
	// is 0 and the heal should land exactly at +20 - except a landed crit
	// (5% base chance, no stats to raise it) doubles it, so retry past that
	// to keep this a check of the un-crit base roll.
	playerID := uuid.New()
	for i := 0; i < 200; i++ {
		state := stateWithInjuredPlayer(playerID)

		require.NoError(t, command.UsePowerHandler{}.Handle(playerID, recoverPower(), instanceconfig.Zone{}, state))

		if state.Units[playerID].Health == 60.0 {
			return
		}
	}
	t.Fatal("recover crit 200 times in a row - crit chance may be miscalibrated")
}

func TestUsePowerHandler_HealScalesWithRecipientsRecoveryRating(t *testing.T) {
	strength := "strength"
	playerID := uuid.New()
	for i := 0; i < 200; i++ {
		state := stateWithInjuredPlayer(playerID)
		state.Units[playerID].EquippedItems = map[string]instanceconfig.EquippedItem{
			"main_hand": {
				Slot: "main_hand", PrimaryStat: &strength,
				SecondaryStats: []string{"stamina", "crit_rating", "recovery_rating"},
			},
		}
		// effective recovery_rating 20 (base secondary 10 * main_hand's 2.0
		// factor) -> healingTakenCeiling(170)*20/(20+310) = 10.30% bonus.

		require.NoError(t, command.UsePowerHandler{}.Handle(playerID, recoverPower(), instanceconfig.Zone{}, state))

		gained := state.Units[playerID].Health - 40.0
		if gained == 20.0 {
			continue // landed crit - retry past it, same as TestUsePowerHandler_HealsSelf
		}
		assert.InDelta(t, 22.06, gained, 0.01) // 20 * 1.1030
		return
	}
	t.Fatal("recover crit 200 times in a row - crit chance may be miscalibrated")
}

func TestUsePowerHandler_HealDoesNotExceedMaxHealth(t *testing.T) {
	playerID := uuid.New()
	state := stateWithInjuredPlayer(playerID)
	state.Units[playerID].Health = 90.0 // 20 heal would overshoot 100

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, recoverPower(), instanceconfig.Zone{}, state))

	assert.Equal(t, 100.0, state.Units[playerID].Health)
}

func TestUsePowerHandler_HealWorksWithoutTarget(t *testing.T) {
	playerID := uuid.New()
	state := stateWithInjuredPlayer(playerID)
	// No target set — self-heal should still fire.

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, recoverPower(), instanceconfig.Zone{}, state))

	assert.Greater(t, state.Units[playerID].Health, 40.0)
}

func TestUsePowerHandler_HealSetsGCD(t *testing.T) {
	playerID := uuid.New()
	state := stateWithInjuredPlayer(playerID)
	before := time.Now()

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, recoverPower(), instanceconfig.Zone{}, state))

	assert.True(t, state.Units[playerID].GlobalCooldownEndsAt.After(before.Add(time.Second)))
}

func TestUsePowerHandler_HealSetsPowerCooldown(t *testing.T) {
	playerID := uuid.New()
	state := stateWithInjuredPlayer(playerID)
	before := time.Now()

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, recoverPower(), instanceconfig.Zone{}, state))

	cd := state.Units[playerID].PowerCooldowns["Recover"]
	assert.True(t, cd.After(before.Add(9*time.Second)))
}

func TestUsePowerHandler_PowerCooldownBlocksRepeatUse(t *testing.T) {
	playerID := uuid.New()
	state := stateWithInjuredPlayer(playerID)

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, recoverPower(), instanceconfig.Zone{}, state))
	// Manually expire GCD so only the per-power cooldown is blocking.
	state.Units[playerID].GlobalCooldownEndsAt = time.Time{}
	afterFirst := state.Units[playerID].Health

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, recoverPower(), instanceconfig.Zone{}, state))

	assert.Equal(t, afterFirst, state.Units[playerID].Health)
}

func TestUsePowerHandler_NoCooldownFieldDoesNotSetPowerCooldown(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))

	assert.Empty(t, state.Units[playerID].PowerCooldowns)
}

func TestUsePowerHandler_ClearsTargetOnDeath(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()

	state := retryUntilPowerLands(t, playerID, targetID, instanceconfig.Zone{}, punchPower(), func() *instancestate.InstanceState {
		state := lowHealthPlayerAndTarget(playerID, targetID)()
		// Give the target its own target to simulate a goblin that had aggro
		state.Units[targetID].Target = &playerID
		return state
	})

	assert.Nil(t, state.Units[targetID].Target)
}

func TestUsePowerHandler_ClearsAttackerTargetAndAttackingOnKill(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()

	state := retryUntilPowerLands(t, playerID, targetID, instanceconfig.Zone{}, punchPower(), func() *instancestate.InstanceState {
		state := lowHealthPlayerAndTarget(playerID, targetID)()
		state.Units[playerID].Attacking = true
		return state
	})

	assert.Nil(t, state.Units[playerID].Target)
	assert.False(t, state.Units[playerID].Attacking)
}

// harmPower builds a single-harm-effect power with a fixed (non-random)
// amount and the given school, so mitigation math is deterministic to test.
func harmPower(amount float64, school string) command.UsePowerPayload {
	amountRange := instanceconfig.ValueRange{amount, amount}
	rng := instanceconfig.ZeroBasedValueRange{0, 5.0}
	return command.UsePowerPayload{
		Power: instanceconfig.Power{
			GlobalCooldown: 1.5,
			Effects: []instanceconfig.PowerEffect{
				{Type: "harm", Affects: "bTarget", Amount: &amountRange, Range: &rng, School: school},
			},
		},
	}
}

func defendedTarget() map[string]instanceconfig.EquippedItem {
	// neck has no primary slot and all 3 secondary slots filled (factor 1.0),
	// so no missing-secondary bonus applies: raw defence_rating = 3*10 = 30.
	return map[string]instanceconfig.EquippedItem{
		"neck": {Slot: "neck", SecondaryStats: []string{"defence_rating", "defence_rating", "defence_rating"}},
	}
}

// retryUntilHarmHealth rebuilds and re-casts harmPower(20.0, school) until
// the target's resulting health matches wantHealth, so the caster's 5% base
// crit chance (no itemized stats to raise it) doesn't make these deterministic
// mitigation-math assertions flaky.
func retryUntilHarmHealth(t *testing.T, school string, wantHealth float64) {
	t.Helper()
	playerID, targetID := uuid.New(), uuid.New()
	for i := 0; i < 200; i++ {
		state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
		state.Units[targetID].EquippedItems = defendedTarget()

		require.NoError(t, command.UsePowerHandler{}.Handle(playerID, harmPower(20.0, school), instanceconfig.Zone{}, state))

		if math.Abs(state.Units[targetID].Health-wantHealth) < 0.01 {
			return
		}
	}
	t.Fatal("harm effect crit 200 times in a row - crit chance may be miscalibrated")
}

func TestUsePowerHandler_HarmEffectAppliesTargetsPhysicalDefenceRating(t *testing.T) {
	// r=30 -> physicalDR = 0.6*30/128 = 0.140625 -> 20*(1-0.140625) = 17.1875 dmg.
	retryUntilHarmHealth(t, "physical", 50.0-17.1875)
}

func TestUsePowerHandler_HarmEffectAppliesTargetsMagicDefenceRatingForAMagicSchool(t *testing.T) {
	// r=30 -> magicDR = 0.24*30/128 = 0.05625 -> 20*(1-0.05625) = 18.875 dmg -
	// less mitigation than the same raw amount would get against physical.
	retryUntilHarmHealth(t, "magic", 50.0-18.875)
}

func TestUsePowerHandler_HarmEffectDefaultsToPhysicalSchool(t *testing.T) {
	retryUntilHarmHealth(t, "", 50.0-17.1875)
}

func TestUsePowerHandler_EngagesIdleHostileTargetOnHit(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
	state.Units[targetID].Hostility = "hostile"

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))

	// The target should notice and fight back immediately, even though it
	// was never within its own aggro radius of the player.
	assert.Equal(t, instancestate.UnitStatusEngaged, state.Units[targetID].Status)
	require.NotNil(t, state.Units[targetID].Target)
	assert.Equal(t, playerID, *state.Units[targetID].Target)
	assert.True(t, state.Units[targetID].Attacking)
}

func TestUsePowerHandler_DoesNotEngageANonHostileTargetOnHit(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
	state.Units[targetID].Hostility = "neutral"

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))

	assert.Equal(t, instancestate.UnitStatusIdle, state.Units[targetID].Status)
	assert.Nil(t, state.Units[targetID].Target)
}

func TestUsePowerHandler_KillAggroesGroupedIdleUnit(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
	state.Units[targetID].Health = 1.0
	linkedID := uuid.New()
	state.Units[linkedID] = &instancestate.UnitState{
		ZoneUnitIdentifier: "goblin_2",
		Position:           instanceconfig.Position{X: 50, Y: 50},
		Health:             10,
		Status:             instancestate.UnitStatusIdle,
	}
	zone := instanceconfig.Zone{
		Maps: []instanceconfig.Map{{
			Units: []instanceconfig.Unit{
				{Identifier: "goblin_1", GroupIdentifier: "pack"},
				{Identifier: "goblin_2", GroupIdentifier: "pack"},
			},
		}},
	}

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), zone, state))

	assert.Equal(t, instancestate.UnitStatusEngaged, state.Units[linkedID].Status)
	require.NotNil(t, state.Units[linkedID].Target)
	assert.Equal(t, playerID, *state.Units[linkedID].Target)
}

func selfStatusPower(status instanceconfig.Status) command.UsePowerPayload {
	return command.UsePowerPayload{
		Power: instanceconfig.Power{
			GlobalCooldown: 1.5,
			Effects: []instanceconfig.PowerEffect{
				{Type: "status", Affects: "self", Duration: 10.0, Status: &status},
			},
		},
	}
}

func targetStatusPower(status instanceconfig.Status) command.UsePowerPayload {
	rng := instanceconfig.ZeroBasedValueRange{0, 5.0}
	return command.UsePowerPayload{
		Power: instanceconfig.Power{
			GlobalCooldown: 1.5,
			Effects: []instanceconfig.PowerEffect{
				{Type: "status", Affects: "bTarget", Range: &rng, Duration: 10.0, Status: &status},
			},
		},
	}
}

func friendlyTargetStatusPower(status instanceconfig.Status) command.UsePowerPayload {
	rng := instanceconfig.ZeroBasedValueRange{0, 5.0}
	return command.UsePowerPayload{
		Power: instanceconfig.Power{
			GlobalCooldown: 1.5,
			Effects: []instanceconfig.PowerEffect{
				{Type: "status", Affects: "gTarget", Range: &rng, Duration: 10.0, Status: &status},
			},
		},
	}
}

func TestUsePowerHandler_AppliesSelfStatus(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
	status := instanceconfig.Status{Name: "Enraged", ShortName: "Enrage", TreatAs: "buff", Stacking: "replace"}

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, selfStatusPower(status), instanceconfig.Zone{}, state))

	require.Len(t, state.Units[playerID].ActiveStatusEffects, 1)
	e := state.Units[playerID].ActiveStatusEffects[0]
	assert.Equal(t, "Enraged", e.Status.Name)
	assert.Equal(t, playerID, e.ApplierID)
	assert.Empty(t, state.Units[targetID].ActiveStatusEffects, "a self-affecting status shouldn't touch the target")
}

func TestUsePowerHandler_AppliesStatusToTarget(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	status := instanceconfig.Status{Name: "Dazed", ShortName: "Dazed", TreatAs: "debuff", Stacking: "replace"}

	// A harmful (debuff) status rolls the same resist chance harm does -
	// retry past an occasional resist to keep this deterministic.
	for i := 0; i < 200; i++ {
		state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 3, 0) // 3ft away, within 5ft range

		require.NoError(t, command.UsePowerHandler{}.Handle(playerID, targetStatusPower(status), instanceconfig.Zone{}, state))

		if len(state.Units[targetID].ActiveStatusEffects) == 0 {
			continue // resisted
		}
		e := state.Units[targetID].ActiveStatusEffects[0]
		assert.Equal(t, "Dazed", e.Status.Name)
		assert.Equal(t, playerID, e.ApplierID)
		assert.Empty(t, state.Units[playerID].ActiveStatusEffects)
		return
	}
	t.Fatal("Dazed resisted 200 times in a row - resist chance may be miscalibrated")
}

func TestUsePowerHandler_TargetStatusOutOfRangeIsNoOp(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 10, 0) // 10ft away, range is 5ft
	status := instanceconfig.Status{Name: "Dazed", ShortName: "Dazed", TreatAs: "debuff", Stacking: "replace"}

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, targetStatusPower(status), instanceconfig.Zone{}, state))

	assert.Empty(t, state.Units[targetID].ActiveStatusEffects)
}

func TestUsePowerHandler_DebuffStatusCanBeResisted(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	status := instanceconfig.Status{Name: "Dazed", ShortName: "Dazed", TreatAs: "debuff", Stacking: "replace"}

	for i := 0; i < 200; i++ {
		state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 3, 0)

		require.NoError(t, command.UsePowerHandler{}.Handle(playerID, targetStatusPower(status), instanceconfig.Zone{}, state))

		if len(state.Units[targetID].ActiveStatusEffects) == 0 {
			return // resisted
		}
	}
	t.Fatal("Dazed landed 200 times in a row - resist chance may be miscalibrated")
}

func TestUsePowerHandler_EngagesIdleHostileTargetOnDebuffStatusEvenWithNoHarm(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 3, 0)
	state.Units[targetID].Hostility = "hostile"
	status := instanceconfig.Status{Name: "Dazed", ShortName: "Dazed", TreatAs: "debuff", Stacking: "replace"}

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, targetStatusPower(status), instanceconfig.Zone{}, state))

	// Aggro fires before the resist roll, so this is deterministic even
	// though the debuff itself might have been resisted.
	assert.Equal(t, instancestate.UnitStatusEngaged, state.Units[targetID].Status)
}

func TestUsePowerHandler_BuffStatusNeverResisted(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	status := instanceconfig.Status{Name: "Enraged", ShortName: "Enrage", TreatAs: "buff", Stacking: "replace"}

	for i := 0; i < 20; i++ {
		state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
		require.NoError(t, command.UsePowerHandler{}.Handle(playerID, selfStatusPower(status), instanceconfig.Zone{}, state))
		require.Len(t, state.Units[playerID].ActiveStatusEffects, 1, "a self buff should never be resisted")
	}
}

// Resistibility is a property of the cast (who it's aimed at via Affects),
// not of the Status's own display-only TreatAs - so these two intentionally
// invert TreatAs relative to Affects to prove the two are decoupled.

func TestUsePowerHandler_BuffStatusCastAtAHostileTargetCanBeResisted(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	// TreatAs "buff" despite being cast at a hostile bTarget - e.g. a status
	// that's flavored as beneficial but forced onto an enemy.
	status := instanceconfig.Status{Name: "Marked", ShortName: "Marked", TreatAs: "buff", Stacking: "replace"}

	for i := 0; i < 200; i++ {
		state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 3, 0)

		require.NoError(t, command.UsePowerHandler{}.Handle(playerID, targetStatusPower(status), instanceconfig.Zone{}, state))

		if len(state.Units[targetID].ActiveStatusEffects) == 0 {
			return // resisted
		}
	}
	t.Fatal("Marked landed 200 times in a row - resist chance may be miscalibrated")
}

func TestUsePowerHandler_DebuffStatusCastAtAFriendlyTargetIsNeverResisted(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	// TreatAs "debuff" despite being cast at a friendly gTarget.
	status := instanceconfig.Status{Name: "Weakened", ShortName: "Weak", TreatAs: "debuff", Stacking: "replace"}

	for i := 0; i < 20; i++ {
		state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 3, 0)

		require.NoError(t, command.UsePowerHandler{}.Handle(playerID, friendlyTargetStatusPower(status), instanceconfig.Zone{}, state))

		require.Len(t, state.Units[targetID].ActiveStatusEffects, 1, "a friendly-targeted status should never be resisted")
	}
}

// costlyPunchPower is punchPower with a 30-energy cost, otherwise identical
// (same range/amount), for cost-gating and resource-spend tests.
func costlyPunchPower() command.UsePowerPayload {
	p := punchPower()
	p.Power.Name = "Costly Punch"
	p.Power.CostType = "energy"
	p.Power.CostAmount = 30.0
	return p
}

func selfResourcePower(delta float64) command.UsePowerPayload {
	return command.UsePowerPayload{
		Power: instanceconfig.Power{
			GlobalCooldown: 1.5,
			Effects: []instanceconfig.PowerEffect{
				{Type: "resource", Affects: "self", ResourceName: "energy", Delta: delta},
			},
		},
	}
}

func targetResourcePower(delta float64) command.UsePowerPayload {
	rng := instanceconfig.ZeroBasedValueRange{0, 5.0}
	return command.UsePowerPayload{
		Power: instanceconfig.Power{
			GlobalCooldown: 1.5,
			Effects: []instanceconfig.PowerEffect{
				{Type: "resource", Affects: "bTarget", Range: &rng, ResourceName: "energy", Delta: delta},
			},
		},
	}
}

// setEnergy gives unit an "energy" resource with the given current/max - the
// resource name costlyPunchPower/selfResourcePower/targetResourcePower all
// key off.
func setEnergy(unit *instancestate.UnitState, current, max float64) {
	unit.Resources = map[string]*instancestate.ResourceState{"energy": {Current: current, Max: max}}
}

func energyOf(unit *instancestate.UnitState) float64 { return unit.Resources["energy"].Current }

func TestUsePowerHandler_InsufficientResourceIsNoOp(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 4, 0)
	setEnergy(state.Units[playerID], 10.0, 100.0)
	before := state.Units[targetID].Health

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, costlyPunchPower(), instanceconfig.Zone{}, state))

	assert.Equal(t, before, state.Units[targetID].Health)
	assert.Equal(t, 10.0, energyOf(state.Units[playerID]), "an unaffordable cast shouldn't spend anything either")
	assert.True(t, state.Units[playerID].GlobalCooldownEndsAt.IsZero(), "an unaffordable cast shouldn't trigger the GCD")
}

func TestUsePowerHandler_SufficientResourceSpendsCost(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()

	state := retryUntilPowerLands(t, playerID, targetID, instanceconfig.Zone{}, costlyPunchPower(), func() *instancestate.InstanceState {
		s := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 4, 0)
		setEnergy(s.Units[playerID], 100.0, 100.0)
		return s
	})

	assert.Equal(t, 70.0, energyOf(state.Units[playerID]))
}

func TestUsePowerHandler_SpendClampsAtZero(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 4, 0)
	setEnergy(state.Units[playerID], 30.0, 100.0)

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, costlyPunchPower(), instanceconfig.Zone{}, state))

	assert.Equal(t, 0.0, energyOf(state.Units[playerID]))
}

func TestUsePowerHandler_ZeroCostPowerDoesNotTouchResource(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 4, 0)
	setEnergy(state.Units[playerID], 42.0, 100.0)

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))

	assert.Equal(t, 42.0, energyOf(state.Units[playerID]))
}

func TestUsePowerHandler_ResourceEffectRestoresSelfResource(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
	setEnergy(state.Units[playerID], 10.0, 100.0)

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, selfResourcePower(15.0), instanceconfig.Zone{}, state))

	assert.Equal(t, 25.0, energyOf(state.Units[playerID]))
}

func TestUsePowerHandler_ResourceEffectClampsAtMax(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
	setEnergy(state.Units[playerID], 90.0, 100.0)

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, selfResourcePower(50.0), instanceconfig.Zone{}, state))

	assert.Equal(t, 100.0, energyOf(state.Units[playerID]))
}

func TestUsePowerHandler_ResourceEffectCanDrainATarget(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 4, 0)
	setEnergy(state.Units[targetID], 50.0, 100.0)

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, targetResourcePower(-20.0), instanceconfig.Zone{}, state))

	assert.Equal(t, 30.0, energyOf(state.Units[targetID]))
}

// --- cast-time powers ---

func punchPowerWithCastTime(castTime float64) command.UsePowerPayload {
	p := punchPower()
	p.Power.CastTime = &castTime
	return p
}

func TestUsePowerHandler_CastTimePowerDoesNotApplyEffectsImmediately(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
	before := state.Units[targetID].Health

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPowerWithCastTime(2.0), instanceconfig.Zone{}, state))

	assert.Equal(t, before, state.Units[targetID].Health)
}

func TestUsePowerHandler_CastTimePowerSetsCastingState(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
	before := time.Now()

	payload := punchPowerWithCastTime(2.0)
	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, payload, instanceconfig.Zone{}, state))

	cast := state.Units[playerID].Casting
	require.NotNil(t, cast)
	assert.Equal(t, payload.Power.Name, cast.Power.Name)
	require.NotNil(t, cast.TargetID)
	assert.Equal(t, targetID, *cast.TargetID)
	assert.True(t, cast.StartedAt.After(before) || cast.StartedAt.Equal(before))
	assert.WithinDuration(t, cast.StartedAt.Add(2*time.Second), cast.EndsAt, time.Millisecond)
}

func TestUsePowerHandler_CastTimePowerCommitsGCDAtCastStart(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
	before := time.Now()

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPowerWithCastTime(2.0), instanceconfig.Zone{}, state))

	assert.True(t, state.Units[playerID].GlobalCooldownEndsAt.After(before.Add(time.Second)))
}

func TestUsePowerHandler_CastTimePowerDoesNotSpendCostAtCastStart(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
	setEnergy(state.Units[playerID], 100.0, 100.0)
	payload := punchPowerWithCastTime(2.0)
	payload.Power.CostType = "energy"
	payload.Power.CostAmount = 30.0

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, payload, instanceconfig.Zone{}, state))

	// Starting a cast only requires affording it (PowerUsable already
	// checked that) - the cost itself isn't spent until the cast actually
	// completes (see command.SpendPowerCost, called from instance.tickCasts).
	assert.Equal(t, 100.0, energyOf(state.Units[playerID]))
}

func TestSpendPowerCost_DeductsCostAmount(t *testing.T) {
	playerID := uuid.New()
	state := stateWithUnit(playerID)
	setEnergy(state.Units[playerID], 100.0, 100.0)

	command.SpendPowerCost(state.Units[playerID], instanceconfig.Power{CostType: "energy", CostAmount: 30.0})

	assert.Equal(t, 70.0, energyOf(state.Units[playerID]))
}

func TestSpendPowerCost_ZeroCostDoesNotTouchResource(t *testing.T) {
	playerID := uuid.New()
	state := stateWithUnit(playerID)
	setEnergy(state.Units[playerID], 100.0, 100.0)

	command.SpendPowerCost(state.Units[playerID], instanceconfig.Power{})

	assert.Equal(t, 100.0, energyOf(state.Units[playerID]))
}

func TestUsePowerHandler_RejectsUseWhileCasting(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPowerWithCastTime(2.0), instanceconfig.Zone{}, state))
	firstCast := state.Units[playerID].Casting

	require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPowerWithCastTime(2.0), instanceconfig.Zone{}, state))

	assert.Same(t, firstCast, state.Units[playerID].Casting)
}

func TestResolveCastTarget_SelfOnlyPowerNeedsNoTarget(t *testing.T) {
	playerID := uuid.New()
	state := stateWithUnit(playerID)
	power := instanceconfig.Power{
		Effects: []instanceconfig.PowerEffect{{Type: "resource", Affects: "self"}},
	}

	target, ok := command.ResolveCastTarget(state.Units[playerID], nil, power, state)

	assert.True(t, ok)
	assert.Nil(t, target)
}

func TestResolveCastTarget_MissingTargetIsRejected(t *testing.T) {
	playerID := uuid.New()
	state := stateWithUnit(playerID)

	target, ok := command.ResolveCastTarget(state.Units[playerID], nil, punchPower().Power, state)

	assert.False(t, ok)
	assert.Nil(t, target)
}

func TestResolveCastTarget_DeadTargetIsRejected(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
	state.Units[targetID].Status = instancestate.UnitStatusDead

	target, ok := command.ResolveCastTarget(state.Units[playerID], state.Units[playerID].Target, punchPower().Power, state)

	assert.False(t, ok)
	assert.Nil(t, target)
}

// --- cast pushback (see command.ApplyCastPushback) ---

func castingTargetState(playerID, targetID uuid.UUID) (*instancestate.InstanceState, time.Time) {
	state := stateWithPlayerAndTarget(playerID, targetID, 0, 0, 0, 0)
	endsAt := time.Now().Add(2 * time.Second)
	state.Units[targetID].Casting = &instancestate.CastState{
		Power:     instanceconfig.Power{Name: "Heal"},
		StartedAt: time.Now(),
		EndsAt:    endsAt,
	}
	return state, endsAt
}

func TestUsePowerHandler_LandedHarmPushesBackTargetsCast(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()

	for i := 0; i < 200; i++ {
		state, endsAt := castingTargetState(playerID, targetID)
		require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))
		if state.Units[targetID].Health < 50.0 {
			assert.True(t, state.Units[targetID].Casting.EndsAt.After(endsAt))
			return
		}
	}
	t.Fatal("punch missed 200 times in a row - miss chance may be miscalibrated")
}

func TestUsePowerHandler_MissedHarmDoesNotPushBackTargetsCast(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()

	for i := 0; i < 200; i++ {
		state, endsAt := castingTargetState(playerID, targetID)
		require.NoError(t, command.UsePowerHandler{}.Handle(playerID, punchPower(), instanceconfig.Zone{}, state))
		if state.Units[targetID].Health == 50.0 {
			assert.Equal(t, endsAt, state.Units[targetID].Casting.EndsAt)
			return
		}
	}
	t.Fatal("punch landed 200 times in a row - miss chance may be miscalibrated")
}
