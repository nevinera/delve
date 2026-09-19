package dpsspread_test

import (
	"math/rand"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/dpsspread"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func seeded(seed int64) *rand.Rand { return rand.New(rand.NewSource(seed)) }

func TestTargetStatsForPlan_OffenseHasNoDefenceRatingOrVersatility(t *testing.T) {
	stats := dpsspread.TargetStatsForPlan(dpsspread.GearingOffense, 0)
	assert.Zero(t, stats.DefenceRating)
}

func TestTargetStatsForPlan_DefenseHasMoreDefenceRatingThanHybridThanOffense(t *testing.T) {
	offense := dpsspread.TargetStatsForPlan(dpsspread.GearingOffense, 0)
	hybrid := dpsspread.TargetStatsForPlan(dpsspread.GearingHybrid, 0)
	defense := dpsspread.TargetStatsForPlan(dpsspread.GearingDefense, 0)

	assert.Greater(t, defense.DefenceRating, hybrid.DefenceRating)
	assert.Greater(t, hybrid.DefenceRating, offense.DefenceRating)
}

func TestTargetStatsForPlan_HigherElevationYieldsMoreStats(t *testing.T) {
	at0 := dpsspread.TargetStatsForPlan(dpsspread.GearingDefense, 0)
	atNeg5 := dpsspread.TargetStatsForPlan(dpsspread.GearingDefense, -5)
	atNeg10 := dpsspread.TargetStatsForPlan(dpsspread.GearingDefense, -10)

	assert.Greater(t, at0.DefenceRating, atNeg5.DefenceRating)
	assert.Greater(t, atNeg5.DefenceRating, atNeg10.DefenceRating)
	assert.Greater(t, at0.MaxHealth, atNeg10.MaxHealth)
}

func TestTargetStatsForPlan_OffenseAndHybridBothGetAgilityFromTheirSharedPrimaryStat(t *testing.T) {
	offense := dpsspread.TargetStatsForPlan(dpsspread.GearingOffense, 0)
	hybrid := dpsspread.TargetStatsForPlan(dpsspread.GearingHybrid, 0)

	assert.Greater(t, offense.Agility, 0.0)
	assert.Greater(t, hybrid.Agility, 0.0)
}

func TestSpread_ReturnsEveryPlanElevationCellExactlyOnce(t *testing.T) {
	enemy := instanceconfig.UnitType{DPS: 10, AttackSpeed: 1}
	cells := dpsspread.Spread(enemy, 100, seeded(1))

	assert.Len(t, cells, len(dpsspread.Plans)*len(dpsspread.Elevations))

	seen := make(map[string]bool)
	for _, c := range cells {
		key := string(c.GearingPlan) + "@" + formatFloat(c.Elevation)
		assert.False(t, seen[key], "duplicate cell %s", key)
		seen[key] = true
		assert.Equal(t, 100.0, c.Result.Duration)
	}
	for _, plan := range dpsspread.Plans {
		for _, ee := range dpsspread.Elevations {
			assert.True(t, seen[string(plan)+"@"+formatFloat(ee)], "missing cell %s@%v", plan, ee)
		}
	}
}

func TestSpread_TankGearTakesLessDPSThanOffenseGearAtTheSameElevation(t *testing.T) {
	enemy := instanceconfig.UnitType{DPS: 20, AttackSpeed: 1}
	cells := dpsspread.Spread(enemy, 6000, seeded(2))

	var offenseDPS, defenseDPS float64
	for _, c := range cells {
		if c.Elevation != 0 {
			continue
		}
		switch c.GearingPlan {
		case dpsspread.GearingOffense:
			offenseDPS = c.Result.DPS
		case dpsspread.GearingDefense:
			defenseDPS = c.Result.DPS
		}
	}

	assert.Greater(t, offenseDPS, defenseDPS)
}

func TestSpread_SameSeedIsDeterministic(t *testing.T) {
	enemy := instanceconfig.UnitType{DPS: 10, AttackSpeed: 1}
	a := dpsspread.Spread(enemy, 100, seeded(42))
	b := dpsspread.Spread(enemy, 100, seeded(42))

	assert.Equal(t, a, b)
}

func formatFloat(f float64) string {
	switch {
	case f == -10:
		return "-10"
	case f == -5:
		return "-5"
	case f == 0:
		return "0"
	default:
		return "?"
	}
}
