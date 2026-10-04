package classdps_test

import (
	"math/rand"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/classdps"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func tankPriority() instanceconfig.StatPriority {
	return instanceconfig.StatPriority{Name: "tank", SecondaryStats: []string{"defence_rating", "stamina", "versatility_rating", "crit_rating", "haste_rating"}}
}

func squishyPriority() instanceconfig.StatPriority {
	return instanceconfig.StatPriority{Name: "dps", SecondaryStats: []string{"crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "recovery_rating"}}
}

func ttdCellFor(cells []classdps.TTDCell, priority, audience, pull, school string, ee int) classdps.TTDCell {
	for _, c := range cells {
		if c.Priority == priority && c.IntendedFor == audience && c.Pull == pull && c.School == school && c.Elevation == ee {
			return c
		}
	}
	panic("no such cell")
}

var (
	sharedOnce  sync.Once
	sharedCells []classdps.TTDCell
)

func sharedTTD() []classdps.TTDCell {
	sharedOnce.Do(func() {
		sharedCells = classdps.TTDMatrix(ttdTestClass(), nil, false, rand.New(rand.NewSource(1)))
	})
	return sharedCells
}

func ttdTestClass() instanceconfig.CharacterClass {
	class := puncherLikeClass()
	class.StatPriorities = []instanceconfig.StatPriority{squishyPriority(), tankPriority()}
	return class
}

func TestTTDMatrix_OneCellPerPriorityAudiencePullSchoolAndElevation(t *testing.T) {
	cells := sharedTTD()

	want := 2 * len(classdps.IntendedFor) * len(classdps.Pulls) * len(classdps.Schools) * len(classdps.TTDElevations)
	assert.Len(t, cells, want)
	for _, c := range cells {
		assert.Equal(t, 300.0, c.CapSeconds)
	}
}

func TestTTDMatrix_ExtendedRaisesTheCap(t *testing.T) {
	class := puncherLikeClass()
	cells := classdps.TTDMatrix(class, nil, true, rand.New(rand.NewSource(1)))
	assert.Equal(t, 1200.0, cells[0].CapSeconds)
}

func TestTTDMatrix_TankGearOutlastsSquishyGear(t *testing.T) {
	cells := sharedTTD()

	squishy := ttdCellFor(cells, "dps", "g1", "pair", "physical", -5)
	tank := ttdCellFor(cells, "tank", "g1", "pair", "physical", -5)
	assert.Greater(t, tank.TTD, squishy.TTD)

	squishy = ttdCellFor(cells, "dps", "open", "solo", "physical", 0)
	tank = ttdCellFor(cells, "tank", "open", "solo", "physical", 0)
	assert.Less(t, tank.HPLostPct, squishy.HPLostPct)
}

func TestTTDMatrix_BiggerPullsCostMoreHealth(t *testing.T) {
	cells := sharedTTD()

	solo := ttdCellFor(cells, "tank", "open", "solo", "physical", 0)
	swarm := ttdCellFor(cells, "tank", "open", "swarm", "physical", 0)
	assert.Greater(t, swarm.HPLostPct, solo.HPLostPct)
}

func TestTTDMatrix_G1CostsMoreThanOpenAndLowerElevationMoreThanHigher(t *testing.T) {
	cells := sharedTTD()

	open := ttdCellFor(cells, "tank", "open", "solo", "physical", 0)
	g1 := ttdCellFor(cells, "tank", "g1", "solo", "physical", 0)
	assert.Greater(t, g1.HPLostPct, open.HPLostPct)

	deep := ttdCellFor(cells, "tank", "open", "solo", "physical", -10)
	assert.Greater(t, deep.HPLostPct, open.HPLostPct)
}

func TestTTDMatrix_ASquishyDiesToAnEndlessPullButAHealingTankSurvivesIt(t *testing.T) {
	heal := instanceconfig.ValueRange{500, 500}
	class := ttdTestClass()
	class.Powers = []instanceconfig.Power{{
		Name: "Mend", GlobalCooldown: 1.5,
		Effects: []instanceconfig.PowerEffect{{Type: "heal", Affects: "self", Amount: &heal}},
	}}
	cells := classdps.TTDMatrix(class, classdps.Strategy{{Power: "Mend"}}, false, rand.New(rand.NewSource(1)))

	healer := ttdCellFor(cells, "tank", "open", "solo", "physical", 0)
	assert.True(t, healer.Survives)
	assert.Equal(t, healer.CapSeconds, healer.TTD)
	assert.False(t, healer.Died)

	// The same class without the heal in its rotation dies to an endless g1 swarm.
	bare := classdps.TTDMatrix(class, nil, false, rand.New(rand.NewSource(1)))
	dead := ttdCellFor(bare, "dps", "g1", "swarm", "physical", -10)
	assert.False(t, dead.Survives)
	assert.Less(t, dead.TTD, dead.CapSeconds)
}

func TestTTDMatrix_ClassWithNoPrioritiesStillRunsOneDefault(t *testing.T) {
	class := puncherLikeClass()
	class.StatPriorities = nil
	cells := classdps.TTDMatrix(class, nil, false, rand.New(rand.NewSource(1)))
	require.NotEmpty(t, cells)
	assert.Equal(t, "default", cells[0].Priority)
}
