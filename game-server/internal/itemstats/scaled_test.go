package itemstats_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/itemstats"
)

func TestScaled_UnchangedAtEE0(t *testing.T) {
	result := itemstats.Scaled(map[string]float64{"strength": 100.0, "stamina": 50.0}, 0)
	assert.InDelta(t, 100.0, result["strength"], 0.01)
	assert.InDelta(t, 50.0, result["stamina"], 0.01)
}

func TestScaled_HalvedAtNegative10(t *testing.T) {
	result := itemstats.Scaled(map[string]float64{"strength": 100.0}, -10)
	assert.InDelta(t, 50.0, result["strength"], 0.01)
}

func TestScaled_ZeroedAtNegative20(t *testing.T) {
	result := itemstats.Scaled(map[string]float64{"strength": 100.0, "crit_rating": 40.0}, -20)
	assert.Equal(t, 0.0, result["strength"])
	assert.Equal(t, 0.0, result["crit_rating"])
}

func TestScaled_DoesNotMutateInput(t *testing.T) {
	raw := map[string]float64{"strength": 100.0}
	itemstats.Scaled(raw, -10)
	assert.Equal(t, 100.0, raw["strength"])
}

func TestScaledSum_ScalesEachAllocationAgainstItsOwnElvl(t *testing.T) {
	result := itemstats.ScaledSum([]itemstats.Allocation{
		// main_hand, factor 2.0, fully itemized -> raw strength 30; at ee=0, em=1.0
		{Slot: "main_hand", Elvl: 50, Primary: strPtr("strength"), Secondaries: []string{"stamina", "crit_rating", "haste_rating"}},
		// same shape, but 20 elvl below the map -> em=0, contributes nothing
		{Slot: "main_hand", Elvl: 30, Primary: strPtr("strength"), Secondaries: []string{"stamina", "crit_rating", "haste_rating"}},
	}, 50)

	assert.InDelta(t, 30.0, result["strength"], 0.01)
}

func TestScaledSum_EmptyAllocationsYieldsEmptyMap(t *testing.T) {
	result := itemstats.ScaledSum(nil, 0)
	assert.Empty(t, result)
}
