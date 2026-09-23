package classdps_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/classdps"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func TestSimulate_NakedClassBasicAttackOnly(t *testing.T) {
	class := instanceconfig.CharacterClass{}
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, nil, 6000)

	// naked -> 0 statDPS, 0 hastePct, 5% base crit, 5% miss:
	// (1+0) * (1+0.05*(2.0-1)) * (1-0.05) = 0.9975
	assert.InEpsilon(t, 0.9975, res.DPS, 0.05)
	assert.Equal(t, res.BasicAttackDamage, res.TotalDamage)
	assert.Zero(t, res.PowerDamage)
	assert.Zero(t, res.StatusTickDamage)
}

func TestSimulate_GearedStrengthClassIncreasesBasicAttackDPS(t *testing.T) {
	strength := "strength"
	class := instanceconfig.CharacterClass{PrimaryStats: []string{"strength"}}
	cfg := classdps.AttackerConfig{
		Class: class,
		EquippedItems: map[string]instanceconfig.EquippedItem{
			"main_hand": {Slot: "main_hand", PrimaryStat: &strength, SecondaryStats: []string{"stamina", "crit_rating", "haste_rating"}},
		},
	}
	res := classdps.Simulate(cfg, nil, 6000)

	assert.Greater(t, res.DPS, 0.9975)
}

func TestSimulate_StrategyPowerContributesPowerDamage(t *testing.T) {
	amount := instanceconfig.ValueRange{50.0, 50.0}
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{{
			Name: "Bolt", GlobalCooldown: 1.5,
			Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amount}},
		}},
	}
	const duration = 6000.0
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{{Power: "Bolt"}}, duration)

	// One 50-damage cast every 1.5s GCD (no haste), each independently
	// missing/critting: (50 * 0.9975) / 1.5 = 33.25 DPS - PowerDamage is
	// the accumulated total over duration, not a rate.
	assert.InEpsilon(t, 33.25*duration, res.PowerDamage, 0.05)
	assert.InDelta(t, res.TotalDamage, res.BasicAttackDamage+res.PowerDamage+res.StatusTickDamage, 0.01)
}

func TestSimulate_UnaffordablePowerNeverFires(t *testing.T) {
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
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{{Power: "Overcharge"}}, 50)

	assert.Zero(t, res.PowerDamage)
}

func TestSimulate_PowerCadenceIsRateLimitedByResourceReturnRateNotJustGCD(t *testing.T) {
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
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{{Power: "Overcharge"}}, duration)

	// GCD (1s) alone would allow a cast every second, but each cast spends
	// 50 and only 10/s regenerates back in - sustained cadence is one cast
	// every 5s (cost/returnRate), not every 1s: (50*0.9975)/5 = 9.975 DPS.
	assert.InEpsilon(t, 9.975*duration, res.PowerDamage, 0.05)
}

func TestSimulate_StatusDoTContributesStatusTickDamage(t *testing.T) {
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
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{{Power: "Ignite"}}, 6600)

	// 4 ticks (t=2,4,6,8) per 9s-active window, every 11s cycle - well more
	// than the direct-hit damage alone (~600 casts * ~1 each).
	assert.Greater(t, res.StatusTickDamage, res.PowerDamage)
}

func TestSimulate_StrategyPrefersHigherPriorityUsablePower(t *testing.T) {
	amountA := instanceconfig.ValueRange{10.0, 10.0}
	amountB := instanceconfig.ValueRange{50.0, 50.0}
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{
			{Name: "A", GlobalCooldown: 1, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amountA}}},
			{Name: "B", GlobalCooldown: 1, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amountB}}},
		},
	}
	const duration = 6000.0
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{{Power: "A"}, {Power: "B"}}, duration)

	// "A" (priority 1, no cooldown, always usable) should be the only
	// power that ever fires - if B were reached too, PowerDamage would
	// reflect a mix including its larger amount: (10*0.9975)/1 = 9.975 DPS.
	assert.InEpsilon(t, 9.975*duration, res.PowerDamage, 0.05)
}

func TestSimulate_StrategyFallsBackToNextEntryWhenTopPriorityUnavailable(t *testing.T) {
	amountA := instanceconfig.ValueRange{10.0, 10.0}
	amountB := instanceconfig.ValueRange{50.0, 50.0}
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{
			{Name: "A", GlobalCooldown: 1, Cooldown: 20, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amountA}}},
			{Name: "B", GlobalCooldown: 1, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amountB}}},
		},
	}
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{{Power: "A"}, {Power: "B"}}, 40)

	// A only lands once (its own 20s cooldown); B (no cooldown of its own)
	// should keep firing every GCD once A is unavailable, not leave a gap.
	avgADamage := 10.0 * 0.9975
	assert.Greater(t, res.PowerDamage, avgADamage*5)
}

func TestSimulate_MissingStatusConditionMaintainsADoT(t *testing.T) {
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
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, strategy, 6000)

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
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, strategy, 40)

	// Finisher is only eligible for the 3s the buff is up out of each 20s
	// cooldown cycle - it should fire far less often than every GCD would
	// allow if the condition weren't gating it.
	unconditionalRate := 100.0 * 0.9975 / 1.5
	assert.Less(t, res.PowerDamage, unconditionalRate*40*0.5)
}

func TestSimulate_UnknownConditionTypeFailsClosed(t *testing.T) {
	amount := instanceconfig.ValueRange{50.0, 50.0}
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{
			{Name: "Bolt", GlobalCooldown: 1, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amount}}},
		},
	}
	strategy := classdps.Strategy{
		{Power: "Bolt", Condition: &classdps.StrategyCondition{Type: "notARealConditionType"}},
	}
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, strategy, 60)

	assert.Zero(t, res.PowerDamage, "an unrecognized condition type should never be treated as satisfied")
}

func TestSimulate_NonListedHealPowerIsNeverUsed(t *testing.T) {
	healAmount := instanceconfig.ValueRange{1000.0, 1000.0}
	class := instanceconfig.CharacterClass{
		Powers: []instanceconfig.Power{{
			Name: "Recover", GlobalCooldown: 1,
			Effects: []instanceconfig.PowerEffect{{Type: "heal", Affects: "self", Amount: &healAmount}},
		}},
	}
	// Empty strategy - "Recover" isn't a DPS power, so it's simply never
	// listed (matches how a real player's rotation would build it).
	res := classdps.Simulate(classdps.AttackerConfig{Class: class}, classdps.Strategy{}, 6000)

	assert.Equal(t, res.BasicAttackDamage, res.TotalDamage)
	assert.Zero(t, res.PowerDamage)
}
