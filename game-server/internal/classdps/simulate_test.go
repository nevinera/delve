package classdps_test

import (
	"math/rand"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/classdps"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func TestSimulate_NakedClassBasicAttackOnly(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	class := instanceconfig.CharacterClass{}
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, nil, 6000, rng)

	// naked -> 0 statDPS, 0 hastePct, 5% base crit, 5% miss:
	// (1+0) * (1+0.05*(2.0-1)) * (1-0.05) = 0.9975
	assert.InEpsilon(t, 0.9975, res.DPS, 0.05)
	assert.Equal(t, res.BasicAttackDamage, res.TotalDamage)
	assert.Zero(t, res.PowerDamage)
	assert.Zero(t, res.StatusTickDamage)
}

func TestSimulate_GearedStrengthClassIncreasesBasicAttackDPS(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	strength := "strength"
	class := instanceconfig.CharacterClass{PrimaryStats: []string{"strength"}}
	cfg := classdps.AttackerConfig{
		Class: class,
		EquippedItems: map[string]instanceconfig.EquippedItem{
			"main_hand": {Slot: "main_hand", PrimaryStat: &strength, SecondaryStats: []string{"stamina", "crit_rating", "haste_rating"}},
		},
	}
	res := classdps.Simulate(cfg, nil, 6000, rng)

	assert.Greater(t, res.DPS, 0.9975)
}

func TestSimulate_StrategyPowerContributesPowerDamage(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	amount := instanceconfig.ValueRange{50.0, 50.0}
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{{
			Name: "Bolt", GlobalCooldown: 1.5,
			Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amount}},
		}},
	}
	const duration = 6000.0
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{{Power: "Bolt"}}, duration, rng)

	// One 50-damage cast every 1.5s GCD (no haste), each independently
	// missing/critting: (50 * 0.9975) / 1.5 = 33.25 DPS - PowerDamage is
	// the accumulated total over duration, not a rate.
	assert.InEpsilon(t, 33.25*duration, res.PowerDamage, 0.05)
	assert.InDelta(t, res.TotalDamage, res.BasicAttackDamage+res.PowerDamage+res.StatusTickDamage, 0.01)
}

func TestSimulate_CastTimePowerCadenceIsBoundByCastTimeNotJustGCD(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	amount := instanceconfig.ValueRange{50.0, 50.0}
	castTime := 3.0
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{{
			Name: "Fireball", GlobalCooldown: 1.5, CastTime: &castTime,
			Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amount}},
		}},
	}
	const duration = 6000.0
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{{Power: "Fireball"}}, duration, rng)

	// One 50-damage cast every 3s cast time (longer than the 1.5s GCD, so
	// cast time - not GCD - is what actually bounds cadence here), each
	// independently missing/critting: (50 * 0.9975) / 3 = 16.625 DPS.
	assert.InEpsilon(t, 16.625*duration, res.PowerDamage, 0.05)
}

func TestSimulate_BasicAttacksHeldDuringAnInProgressCast(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	amount := instanceconfig.ValueRange{50.0, 50.0}
	castTime := 100.0 // longer than the whole simulated duration below
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{{
			Name: "LongCast", GlobalCooldown: 1.5, CastTime: &castTime,
			Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amount}},
		}},
	}
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{{Power: "LongCast"}}, 60, rng)

	assert.Zero(t, res.PowerDamage, "cast never completes within the simulated duration")
	// The very first basic-attack check and the cast selection are both due
	// at simulated t=0 - the swing (already due) fires before the cast
	// starts that same instant, same ordering the real engine uses (basic
	// attack, then power selection, within one tick) - so at most one swing
	// lands, not the ~30 an uninterrupted naked class's basic attack would
	// land over 60s (roughly one every 2s).
	assert.Less(t, res.BasicAttackDamage, 5.0, "only the simultaneous first-instant swing should land, not a full stream")
}

func TestSimulate_UnaffordablePowerNeverFires(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	amount := instanceconfig.ValueRange{50.0, 50.0}
	class := instanceconfig.CharacterClass{
		Resources: []instanceconfig.ResourceType{
			{Name: "energy", Max: 50, DefaultValue: 50, IsFluid: true, DisplayType: "primary"},
		},
		Powers: []instanceconfig.Power{{
			Name: "Overcharge", GlobalCooldown: 1, CostType: "energy", CostAmount: 100, // more than Max: never affordable
			Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amount}},
		}},
	}
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{{Power: "Overcharge"}}, 50, rng)

	assert.Zero(t, res.PowerDamage)
}

func TestSimulate_PowerCadenceIsRateLimitedByResourceReturnRateNotJustGCD(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	amount := instanceconfig.ValueRange{50.0, 50.0}
	class := instanceconfig.CharacterClass{
		Resources: []instanceconfig.ResourceType{
			{Name: "energy", Max: 100, DefaultValue: 100, ReturnRate: 10, IsFluid: true, DisplayType: "primary"},
		},
		Powers: []instanceconfig.Power{{
			Name: "Overcharge", GlobalCooldown: 1, CostType: "energy", CostAmount: 50,
			Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amount}},
		}},
	}
	const duration = 30000.0
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{{Power: "Overcharge"}}, duration, rng)

	// GCD (1s) alone would allow a cast every second, but each cast spends
	// 50 and only 10/s regenerates back in - sustained cadence is one cast
	// every 5s (cost/returnRate), not every 1s: (50*0.9975)/5 = 9.975 DPS.
	assert.InEpsilon(t, 9.975*duration, res.PowerDamage, 0.05)
}

func TestSimulate_StatusDoTContributesStatusTickDamage(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	amount := instanceconfig.ValueRange{1.0, 1.0} // negligible direct damage, isolates the DoT
	status := instanceconfig.Status{
		Name: "Burn", ShortName: "Burn", TreatAs: "debuff", Stacking: "replace",
		Effects: []instanceconfig.StatusEffect{
			{Type: "recurring", TickRate: 2, OnTick: "harm", Amount: 20},
		},
	}
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{{
			Name: "Ignite", GlobalCooldown: 11, // > the status's own 9s active window
			Effects: []instanceconfig.PowerEffect{
				{Type: "harm", Amount: &amount},
				{Type: "status", Affects: "bTarget", Duration: 9, Status: &status},
			},
		}},
	}
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{{Power: "Ignite"}}, 6600, rng)

	// 4 ticks (t=2,4,6,8) per 9s-active window, every 11s cycle - well more
	// than the direct-hit damage alone (~600 casts * ~1 each).
	assert.Greater(t, res.StatusTickDamage, res.PowerDamage)
}

func TestSimulate_ConditionalStatusDoTNeverTicksWhenConditionNeverHolds(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	amount := instanceconfig.ValueRange{1.0, 1.0}
	status := instanceconfig.Status{
		Name: "Burn", ShortName: "Burn", TreatAs: "debuff", Stacking: "replace",
		Effects: []instanceconfig.StatusEffect{
			{
				Type: "recurring", TickRate: 2, OnTick: "harm", Amount: 20,
				Condition: &instanceconfig.StatusEffectCondition{Type: "hasStatus", StatusName: "Enrage"}, // never applied by this class
			},
		},
	}
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{{
			Name: "Ignite", GlobalCooldown: 11,
			Effects: []instanceconfig.PowerEffect{
				{Type: "harm", Amount: &amount},
				{Type: "status", Affects: "bTarget", Duration: 9, Status: &status},
			},
		}},
	}
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{{Power: "Ignite"}}, 6600, rng)

	assert.Zero(t, res.StatusTickDamage, "the DoT's condition is never met, so it should never tick")
}

func TestSimulate_ConditionalStatusDoTTicksWhenConditionHolds(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	amount := instanceconfig.ValueRange{1.0, 1.0}
	enrage := instanceconfig.Status{Name: "Enrage", ShortName: "Enrage", TreatAs: "buff", Stacking: "replace"}
	status := instanceconfig.Status{
		Name: "Burn", ShortName: "Burn", TreatAs: "debuff", Stacking: "replace",
		Effects: []instanceconfig.StatusEffect{
			{
				Type: "recurring", TickRate: 2, OnTick: "harm", Amount: 20,
				Condition: &instanceconfig.StatusEffectCondition{Type: "hasStatus", StatusName: "Enrage"},
			},
		},
	}
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{{
			Name: "Ignite", GlobalCooldown: 11,
			Effects: []instanceconfig.PowerEffect{
				{Type: "harm", Amount: &amount},
				{Type: "status", Affects: "bTarget", Duration: 9, Status: &enrage},
				{Type: "status", Affects: "bTarget", Duration: 9, Status: &status},
			},
		}},
	}
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{{Power: "Ignite"}}, 6600, rng)

	assert.Greater(t, res.StatusTickDamage, 0.0, "Enrage is applied to the same target as the DoT, so its condition should hold and it should tick")
}

func TestSimulate_SelfTriggeredEffectFiresOnDealsDamage(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	amount := instanceconfig.ValueRange{1.0, 1.0} // negligible direct damage, isolates the proc
	proc := instanceconfig.Status{
		Name: "Cleave", ShortName: "Cleave", TreatAs: "inherent", Stacking: "replace",
		Effects: []instanceconfig.StatusEffect{
			{
				Type: "triggered", InternalCooldown: 1000, // large enough to fire at most once
				Trigger:         &instanceconfig.StatusTrigger{Type: "dealsDamage"},
				TriggeredEffect: &instanceconfig.TriggeredEffect{Type: "harm", Affects: "target", Amount: &instanceconfig.ValueRange{20.0, 20.0}},
			},
		},
	}
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{{
			Name: "Ignite", GlobalCooldown: 11,
			Effects: []instanceconfig.PowerEffect{
				{Type: "harm", Amount: &amount},
				{Type: "status", Affects: "self", Duration: 9, Status: &proc},
			},
		}},
	}
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{{Power: "Ignite"}}, 6600, rng)

	assert.Greater(t, res.TriggeredDamage, 0.0, "unit's own dealsDamage should be observable to a self-applied trigger")
	assert.Equal(t, res.TotalDamage, res.BasicAttackDamage+res.PowerDamage+res.StatusTickDamage+res.TriggeredDamage)
}

func TestSimulate_TargetHeldDealsDamageTriggerNeverFires(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	// target never attacks in this simulation (see doc.go's Known gaps),
	// so a dealsDamage trigger on a status applied *to* target should
	// never hold, even though unit deals damage constantly.
	amount := instanceconfig.ValueRange{1.0, 1.0}
	proc := instanceconfig.Status{
		Name: "Retaliate", ShortName: "Retal", TreatAs: "debuff", Stacking: "replace",
		Effects: []instanceconfig.StatusEffect{
			{
				Type: "triggered", InternalCooldown: 0.1,
				Trigger:         &instanceconfig.StatusTrigger{Type: "dealsDamage"},
				TriggeredEffect: &instanceconfig.TriggeredEffect{Type: "harm", Affects: "target", Amount: &instanceconfig.ValueRange{20.0, 20.0}},
			},
		},
	}
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{{
			Name: "Ignite", GlobalCooldown: 11,
			Effects: []instanceconfig.PowerEffect{
				{Type: "harm", Amount: &amount},
				{Type: "status", Affects: "bTarget", Duration: 9, Status: &proc},
			},
		}},
	}
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{{Power: "Ignite"}}, 6600, rng)

	assert.Zero(t, res.TriggeredDamage)
}

func TestSimulate_StrategyPrefersHigherPriorityUsablePower(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	amountA := instanceconfig.ValueRange{10.0, 10.0}
	amountB := instanceconfig.ValueRange{50.0, 50.0}
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{
			{Name: "A", GlobalCooldown: 1, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amountA}}},
			{Name: "B", GlobalCooldown: 1, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amountB}}},
		},
	}
	const duration = 6000.0
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{{Power: "A"}, {Power: "B"}}, duration, rng)

	// "A" (priority 1, no cooldown, always usable) should be the only
	// power that ever fires - if B were reached too, PowerDamage would
	// reflect a mix including its larger amount: (10*0.9975)/1 = 9.975 DPS.
	assert.InEpsilon(t, 9.975*duration, res.PowerDamage, 0.05)
}

func TestSimulate_StrategyFallsBackToNextEntryWhenTopPriorityUnavailable(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	amountA := instanceconfig.ValueRange{10.0, 10.0}
	amountB := instanceconfig.ValueRange{50.0, 50.0}
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{
			{Name: "A", GlobalCooldown: 1, Cooldown: 20, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amountA}}},
			{Name: "B", GlobalCooldown: 1, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amountB}}},
		},
	}
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{{Power: "A"}, {Power: "B"}}, 40, rng)

	// A only lands once (its own 20s cooldown); B (no cooldown of its own)
	// should keep firing every GCD once A is unavailable, not leave a gap.
	avgADamage := 10.0 * 0.9975
	assert.Greater(t, res.PowerDamage, avgADamage*5)
}

func TestSimulate_MissingStatusConditionMaintainsADoT(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	dotAmount := instanceconfig.ValueRange{0.0, 0.0} // isolates the DoT tick from any direct-hit noise
	filler := instanceconfig.ValueRange{10.0, 10.0}
	moonfire := instanceconfig.Status{
		Name: "Moonfire", ShortName: "Mnfire", TreatAs: "debuff", Stacking: "replace",
		Effects: []instanceconfig.StatusEffect{
			{Type: "recurring", TickRate: 2, OnTick: "harm", Amount: 20},
		},
	}
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{
			{
				Name: "Moonfire", GlobalCooldown: 1.5,
				Effects: []instanceconfig.PowerEffect{
					{Type: "harm", Amount: &dotAmount},
					{Type: "status", Affects: "bTarget", Duration: 12, Status: &moonfire},
				},
			},
			{Name: "Wrath", GlobalCooldown: 1.5, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &filler}}},
		},
	}
	strategy := classdps.Strategy{
		{Power: "Moonfire", Condition: &classdps.StrategyCondition{Type: "missingStatus", On: "target", Status: "Moonfire"}},
		{Power: "Wrath"},
	}
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, strategy, 6000, rng)

	// Moonfire only recasts once its own DoT has expired (every ~12s, a
	// small fraction of GCDs), so Wrath should fill nearly every other GCD -
	// PowerDamage should stay close to (a bit under) Wrath's own solo rate,
	// not the much lower rate an unconditional Moonfire spam would produce
	// (Moonfire's own direct-hit amount is 0, isolating this check to
	// "how often did each power actually get chosen").
	wrathOnlyRate := 10.0 * 0.9975 / 1.5
	assert.InEpsilon(t, wrathOnlyRate*6000, res.PowerDamage, 0.15)
	assert.Greater(t, res.StatusTickDamage, 0.0)
}

func TestSimulate_HasStatusConditionOnlyFiresWhileBuffIsActive(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	buffAmount := instanceconfig.ValueRange{0.0, 0.0}
	finisherAmount := instanceconfig.ValueRange{100.0, 100.0}
	readyStatus := instanceconfig.Status{
		Name: "Ready", ShortName: "Ready", TreatAs: "buff", Stacking: "replace", Effects: []instanceconfig.StatusEffect{},
	}
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{
			{
				Name: "Prepare", GlobalCooldown: 1.5, Cooldown: 20,
				Effects: []instanceconfig.PowerEffect{
					{Type: "harm", Amount: &buffAmount},
					{Type: "status", Affects: "self", Duration: 3, Status: &readyStatus},
				},
			},
			{
				Name: "Finisher", GlobalCooldown: 1.5,
				Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &finisherAmount}},
			},
		},
	}
	strategy := classdps.Strategy{
		{Power: "Finisher", Condition: &classdps.StrategyCondition{Type: "hasStatus", On: "self", Status: "Ready"}},
		{Power: "Prepare"},
	}
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, strategy, 40, rng)

	// Finisher is only eligible for the 3s the buff is up out of each 20s
	// cooldown cycle - it should fire far less often than every GCD would
	// allow if the condition weren't gating it.
	unconditionalRate := 100.0 * 0.9975 / 1.5
	assert.Less(t, res.PowerDamage, unconditionalRate*40*0.5)
}

func TestSimulate_UnknownConditionTypeFailsClosed(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	amount := instanceconfig.ValueRange{50.0, 50.0}
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{
			{Name: "Bolt", GlobalCooldown: 1, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amount}}},
		},
	}
	strategy := classdps.Strategy{
		{Power: "Bolt", Condition: &classdps.StrategyCondition{Type: "notARealConditionType"}},
	}
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, strategy, 60, rng)

	assert.Zero(t, res.PowerDamage, "an unrecognized condition type should never be treated as satisfied")
}

func TestSimulate_NonListedHealPowerIsNeverUsed(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	healAmount := instanceconfig.ValueRange{1000.0, 1000.0}
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{{
			Name: "Recover", GlobalCooldown: 1,
			Effects: []instanceconfig.PowerEffect{{Type: "heal", Affects: "self", Amount: &healAmount}},
		}},
	}
	// Empty strategy - "Recover" isn't a DPS power, so it's simply never
	// listed (matches how a real player's rotation would build it).
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{}, 6000, rng)

	assert.Equal(t, res.BasicAttackDamage, res.TotalDamage)
	assert.Zero(t, res.PowerDamage)
}
