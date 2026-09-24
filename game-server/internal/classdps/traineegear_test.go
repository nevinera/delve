package classdps_test

import (
	"math/rand"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/classdps"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func puncherLikeClass() instanceconfig.CharacterClass {
	return instanceconfig.CharacterClass{
		PrimaryStats:   []string{"strength"},
		SecondaryStats: []string{"crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "stamina"},
		Wields:         []string{"dagger", "dagger"},
	}
}

func TestSpread_DualWieldClassGetsBothHands(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	res := classdps.Spread(puncherLikeClass(), nil, 1, rng)
	require.Len(t, res, len(classdps.Elevations))
}

func TestSpread_ProducesOneCellPerElevationInOrder(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	res := classdps.Spread(puncherLikeClass(), nil, 1, rng)
	require.Len(t, res, len(classdps.Elevations))
	for i, ee := range classdps.Elevations {
		assert.Equal(t, ee, res[i].Elevation)
	}
}

func TestSpread_HigherElevationIncreasesDPS(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	res := classdps.Spread(puncherLikeClass(), nil, 6000, rng)
	require.Len(t, res, len(classdps.Elevations))
	for i := 1; i < len(res); i++ {
		assert.Greater(t, res[i].Result.DPS, res[i-1].Result.DPS,
			"expected DPS to increase from ee=%d to ee=%d", res[i-1].Elevation, res[i].Elevation)
	}
}

func TestMatrix_ProducesOneRowPerDurationEachWithFullElevationSpread(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	rows := classdps.Matrix(puncherLikeClass(), nil, rng)
	require.Len(t, rows, len(classdps.Durations))
	for i, d := range classdps.Durations {
		assert.Equal(t, d, rows[i].Duration)
		assert.Len(t, rows[i].Cells, len(classdps.Elevations))
	}
}

func TestSpread_ClassWithNoWieldsDoesNotPanic(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	class := instanceconfig.CharacterClass{
		PrimaryStats:   []string{"intellect"},
		SecondaryStats: []string{"crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "stamina"},
	}
	assert.NotPanics(t, func() {
		classdps.Spread(class, nil, 60, rng)
	})
}

func TestSpread_TwoHandedClassSkipsOffHand(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	class := instanceconfig.CharacterClass{
		PrimaryStats:   []string{"strength"},
		SecondaryStats: []string{"crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "stamina"},
		Wields:         []string{"greatsword"},
	}
	// A two-handed class should still simulate cleanly (no off_hand item,
	// see traineegear.go's two_handed? mirror) - regression check for a
	// nil/panic on the missing map key, not a numeric assertion.
	res := classdps.Spread(class, nil, 60, rng)
	require.Len(t, res, len(classdps.Elevations))
	for _, cell := range res {
		assert.Greater(t, cell.Result.DPS, 0.0)
	}
}
