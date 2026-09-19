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
