package dpssim_test

import (
	"math"
	"math/rand"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/dpssim"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func seeded(seed int64) *rand.Rand { return rand.New(rand.NewSource(seed)) }

func TestSimulate_BasicAttackOnly_MatchesExpectedDPSAgainstUnmitigatedTarget(t *testing.T) {
	enemy := instanceconfig.UnitType{DPS: 10, AttackSpeed: 1}
	res := dpssim.Simulate(enemy, dpssim.TargetStats{}, 6000, seeded(1))

	// E[dps] = DPS * P(not miss) * (P(crit)*2 + P(not crit)*1)
	//        = 10 * 0.95 * (0.05*2 + 0.95*1) = 9.975
	assert.InEpsilon(t, 9.975, res.DPS, 0.05)
	assert.Equal(t, res.BasicAttackDamage, res.TotalDamage)
	assert.Zero(t, res.PowerDamage)
	assert.Zero(t, res.StatusTickDamage)
}

func TestSimulate_DefenceRatingReducesBasicAttackDamage(t *testing.T) {
	enemy := instanceconfig.UnitType{DPS: 10, AttackSpeed: 1}
	target := dpssim.TargetStats{DefenceRating: 98} // dr = 0.6 * 98/(98+98) = 0.3
	res := dpssim.Simulate(enemy, target, 6000, seeded(2))

	assert.InEpsilon(t, 9.975*0.7, res.DPS, 0.05)
}

func TestSimulate_AvoidanceReducesBasicAttackDamage(t *testing.T) {
	enemy := instanceconfig.UnitType{DPS: 10, AttackSpeed: 1} // physical (default school)
	target := dpssim.TargetStats{Strength: 750}               // avoidance = 0.6 * 750/(750+250) = 0.45
	res := dpssim.Simulate(enemy, target, 6000, seeded(3))

	assert.InEpsilon(t, 9.975*0.55, res.DPS, 0.05)
}

func TestSimulate_MagicBasicAttackIsMitigatedByIntellectAvoidanceNotStrength(t *testing.T) {
	enemy := instanceconfig.UnitType{DPS: 10, AttackSpeed: 1, BasicAttackSchool: "magic"}
	target := dpssim.TargetStats{Strength: 750} // physical-only stat; shouldn't avoid a magic attack
	res := dpssim.Simulate(enemy, target, 6000, seeded(4))

	assert.InEpsilon(t, 9.975, res.DPS, 0.05)
}

func TestSimulate_PowerHarmEffectContributesDamageAtItsOwnGCDRate(t *testing.T) {
	amount := instanceconfig.ValueRange{50, 50}
	enemy := instanceconfig.UnitType{
		Powers: []instanceconfig.Power{{
			Name:           "Slam",
			GlobalCooldown: 2,
			Effects:        []instanceconfig.PowerEffect{{Type: "harm", Amount: &amount}},
		}},
	}
	res := dpssim.Simulate(enemy, dpssim.TargetStats{}, 6000, seeded(5))

	// One 50-damage cast every 2s, each independently missing/critting:
	// (50 * 0.9975) / 2 = 24.9375
	assert.InEpsilon(t, 24.9375, res.DPS, 0.05)
	assert.Zero(t, res.BasicAttackDamage)
	assert.Equal(t, res.PowerDamage, res.TotalDamage)
}

func TestSimulate_RecurringStatusTicksContributeDamageWhileActive(t *testing.T) {
	status := instanceconfig.Status{
		Name:     "Bleed",
		Stacking: "replace",
		Effects: []instanceconfig.StatusEffect{
			{Type: "recurring", TickRate: 2, OnTick: "harm", Amount: 20},
		},
	}
	enemy := instanceconfig.UnitType{
		Powers: []instanceconfig.Power{{
			Name:           "Rend",
			GlobalCooldown: 11, // > the status's own 9s active window - no mid-flight reapply
			Effects: []instanceconfig.PowerEffect{
				{Type: "status", Duration: 9, Status: &status},
			},
		}},
	}
	res := dpssim.Simulate(enemy, dpssim.TargetStats{}, 6600, seeded(6)) // 600 11s cycles

	// 4 ticks (t=2,4,6,8) per 9s-active window, each (20*0.9975), every 11s cycle:
	// (4 * 20 * 0.9975) / 11 = 7.254545...
	assert.InEpsilon(t, 7.2545, res.DPS, 0.05)
	assert.Zero(t, res.BasicAttackDamage)
	assert.Zero(t, res.PowerDamage)
	assert.Equal(t, res.StatusTickDamage, res.TotalDamage)
}

func TestSimulate_UnaffordablePowerNeverFires(t *testing.T) {
	amount := instanceconfig.ValueRange{50, 50}
	enemy := instanceconfig.UnitType{
		Resource: instanceconfig.ResourceType{Max: 50, DefaultValue: 50},
		Powers: []instanceconfig.Power{{
			Name: "Overcharge", GlobalCooldown: 1, CostType: "energy", CostAmount: 100, // more than Max: never affordable
			Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amount}},
		}},
	}
	res := dpssim.Simulate(enemy, dpssim.TargetStats{}, 50, seeded(9))

	assert.Zero(t, res.TotalDamage)
}

func TestSimulate_PowerCadenceIsRateLimitedByResourceReturnRateNotJustGCD(t *testing.T) {
	amount := instanceconfig.ValueRange{50, 50}
	enemy := instanceconfig.UnitType{
		Resource: instanceconfig.ResourceType{Max: 100, DefaultValue: 100, ReturnRate: 10},
		Powers: []instanceconfig.Power{{
			Name: "Overcharge", GlobalCooldown: 1, CostType: "energy", CostAmount: 50,
			Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amount}},
		}},
	}
	res := dpssim.Simulate(enemy, dpssim.TargetStats{}, 30000, seeded(10))

	// GCD (1s) alone would allow a cast every second, but each cast spends
	// 50 and only 10/s regenerates back in - sustained cadence is one cast
	// every 5s (cost/returnRate), not every 1s (GCD):
	// (50 * 0.9975) / 5 = 9.975
	assert.InEpsilon(t, 9.975, res.DPS, 0.05)
	assert.Equal(t, res.PowerDamage, res.TotalDamage)
}

func TestSimulate_ResourceEffectReplenishesResourceEnablingRepeatedCasts(t *testing.T) {
	amount := instanceconfig.ValueRange{10, 10}
	enemy := instanceconfig.UnitType{
		Resource: instanceconfig.ResourceType{Max: 100, DefaultValue: 20}, // ReturnRate 0: no passive regen at all
		Powers: []instanceconfig.Power{{
			Name: "SelfFund", GlobalCooldown: 1, CostType: "energy", CostAmount: 20,
			Effects: []instanceconfig.PowerEffect{
				{Type: "harm", Amount: &amount},
				{Type: "resource", Affects: "self", ResourceName: "energy", Delta: 30},
			},
		}},
	}
	res := dpssim.Simulate(enemy, dpssim.TargetStats{}, 20, seeded(11))

	// Without the resource effect actually applying, only the first cast
	// (resource starts at exactly the 20 cost) could ever land - ReturnRate
	// is 0, so resource would sit at 0 forever after. Each cast here nets
	// +10 resource (delta 30, cost 20), so it should keep firing every GCD
	// instead of stopping after one - assert well more landed than a single
	// cast's worth of damage.
	avgDamagePerCast := 10.0 * 0.9975
	assert.Greater(t, res.PowerDamage, avgDamagePerCast*5)
}

func TestSimulate_PowerCadenceIsRateLimitedByItsOwnCooldownNotJustGCD(t *testing.T) {
	amount := instanceconfig.ValueRange{50, 50}
	enemy := instanceconfig.UnitType{
		Powers: []instanceconfig.Power{{
			Name: "Pound", GlobalCooldown: 1, Cooldown: 20,
			Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amount}},
		}},
	}
	res := dpssim.Simulate(enemy, dpssim.TargetStats{}, 20000, seeded(12))

	// GCD (1s) alone would allow a cast every second, but Cooldown (20s)
	// gates the power itself, same as command.PowerUsable: (50*0.9975)/20 =
	// 2.49375
	assert.InEpsilon(t, 2.49375, res.DPS, 0.05)
	assert.Equal(t, res.PowerDamage, res.TotalDamage)
}

func TestSimulate_TwoPowersOnCooldownStillLetsTheOtherFire(t *testing.T) {
	amountA := instanceconfig.ValueRange{10, 10}
	amountB := instanceconfig.ValueRange{50, 50}
	enemy := instanceconfig.UnitType{
		Powers: []instanceconfig.Power{
			{
				Name: "Jab", GlobalCooldown: 1,
				Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amountA}},
			},
			{
				Name: "Pound", GlobalCooldown: 1, Cooldown: 20,
				Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amountB}},
			},
		},
	}
	res := dpssim.Simulate(enemy, dpssim.TargetStats{}, 40, seeded(13))

	// Pound only lands once (its own 20s cooldown, well within the 40s run);
	// Jab has no cooldown of its own and keeps firing every GCD once Pound
	// is unavailable - so total power casts should be well more than one.
	avgJabDamage := 10.0 * 0.9975
	assert.Greater(t, res.PowerDamage, avgJabDamage*5)
}

func TestSimulate_PriorityRotationAlwaysUsesTheHigherPriorityAvailablePower(t *testing.T) {
	amountA := instanceconfig.ValueRange{10, 10}
	amountB := instanceconfig.ValueRange{50, 50}
	enemy := instanceconfig.UnitType{
		Tactics: instanceconfig.UnitTactics{Type: "priorityRotation", Powers: []string{"A", "B"}},
		Powers: []instanceconfig.Power{
			{Name: "A", GlobalCooldown: 1, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amountA}}},
			{Name: "B", GlobalCooldown: 1, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amountB}}},
		},
	}
	res := dpssim.Simulate(enemy, dpssim.TargetStats{}, 6000, seeded(20))

	// "A" (priority 1, no cooldown, always available) should be the only
	// power that ever fires - "B" is never reached. If selection were
	// uniform random between the two instead, DPS would converge to
	// ((10+50)/2 * 0.9975)/1 = 29.925 - clearly distinguishable from A alone.
	assert.InEpsilon(t, 9.975, res.DPS, 0.05)
}

func TestSimulate_RotationWaitsForItsCurrentPowerRatherThanReusingTheOther(t *testing.T) {
	amountA := instanceconfig.ValueRange{10, 10}
	amountB := instanceconfig.ValueRange{50, 50}
	enemy := instanceconfig.UnitType{
		Tactics: instanceconfig.UnitTactics{Type: "rotation", Powers: []string{"A", "B"}},
		Powers: []instanceconfig.Power{
			{Name: "A", GlobalCooldown: 1, Cooldown: 100, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amountA}}},
			{Name: "B", GlobalCooldown: 1, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amountB}}},
		},
	}
	res := dpssim.Simulate(enemy, dpssim.TargetStats{}, 150, seeded(21))

	// Expected sequence: A fires (t~0), advance to B; B fires (t~1),
	// advance to A; A is on its own 100s cooldown, so rotation *waits*
	// there rather than reusing B again - nothing fires again until A's
	// cooldown clears (~t=100), then A, then B once more before the 150s
	// run ends. ~4 total casts. If rotation instead skipped ahead and kept
	// reusing B (as priorityRotation or random selection would, since B has
	// no cooldown and is always available), this would be ~150 casts of B
	// alone - two clearly separated orders of magnitude.
	assert.Greater(t, res.PowerDamage, 0.0)
	assert.Less(t, res.PowerDamage, 1000.0)
}

func TestSimulate_PhasedUsesFirstPhaseTacticsInitially(t *testing.T) {
	amountA := instanceconfig.ValueRange{10, 10}
	amountB := instanceconfig.ValueRange{50, 50}
	enemy := instanceconfig.UnitType{
		Tactics: instanceconfig.UnitTactics{
			Type: "phased",
			Phases: []instanceconfig.Phase{
				{
					Tactics:    instanceconfig.UnitTactics{Type: "priorityRotation", Powers: []string{"A"}},
					Transition: &instanceconfig.PhaseTransition{TimeElapsed: floatPtr(10000)}, // never, within this run
				},
				{Tactics: instanceconfig.UnitTactics{Type: "priorityRotation", Powers: []string{"B"}}},
			},
		},
		Powers: []instanceconfig.Power{
			{Name: "A", GlobalCooldown: 1, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amountA}}},
			{Name: "B", GlobalCooldown: 1, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amountB}}},
		},
	}
	res := dpssim.Simulate(enemy, dpssim.TargetStats{}, 6000, seeded(22))

	assert.InEpsilon(t, 9.975, res.DPS, 0.05) // A's rate (10*0.9975)/1 - B never reached
}

func TestSimulate_PhasedTransitionsToNextPhaseAfterTimeElapsed(t *testing.T) {
	amountA := instanceconfig.ValueRange{10, 10}
	amountB := instanceconfig.ValueRange{50, 50}
	enemy := instanceconfig.UnitType{
		Tactics: instanceconfig.UnitTactics{
			Type: "phased",
			Phases: []instanceconfig.Phase{
				{
					Tactics:    instanceconfig.UnitTactics{Type: "priorityRotation", Powers: []string{"A"}},
					Transition: &instanceconfig.PhaseTransition{TimeElapsed: floatPtr(1)}, // negligible against the 6000s run below
				},
				{Tactics: instanceconfig.UnitTactics{Type: "priorityRotation", Powers: []string{"B"}}},
			},
		},
		Powers: []instanceconfig.Power{
			{Name: "A", GlobalCooldown: 1, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amountA}}},
			{Name: "B", GlobalCooldown: 1, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amountB}}},
		},
	}
	res := dpssim.Simulate(enemy, dpssim.TargetStats{}, 6000, seeded(23))

	assert.InEpsilon(t, 49.875, res.DPS, 0.05) // B's rate (50*0.9975)/1 - the first 1s of A is negligible over 6000s
}

func floatPtr(f float64) *float64 { return &f }

func TestSimulate_NoBasicAttackNoPowersDealsNoDamage(t *testing.T) {
	res := dpssim.Simulate(instanceconfig.UnitType{}, dpssim.TargetStats{}, 100, seeded(7))

	assert.Zero(t, res.TotalDamage)
	assert.Zero(t, res.DPS)
	assert.True(t, math.IsInf(res.TTD, 1))
}

func TestSimulate_TTDIsMaxHealthOverDPS(t *testing.T) {
	enemy := instanceconfig.UnitType{DPS: 10, AttackSpeed: 1}
	target := dpssim.TargetStats{MaxHealth: 200}
	res := dpssim.Simulate(enemy, target, 6000, seeded(8))

	assert.InDelta(t, target.MaxHealth/res.DPS, res.TTD, 0.001)
}

func TestSimulate_SameSeedIsDeterministic(t *testing.T) {
	enemy := instanceconfig.UnitType{DPS: 10, AttackSpeed: 1}
	a := dpssim.Simulate(enemy, dpssim.TargetStats{}, 500, seeded(42))
	b := dpssim.Simulate(enemy, dpssim.TargetStats{}, 500, seeded(42))

	assert.Equal(t, a, b)
}
