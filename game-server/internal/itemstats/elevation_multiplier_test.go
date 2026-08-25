package itemstats_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/itemstats"
)

func TestElevationMultiplier(t *testing.T) {
	cases := []struct {
		ee   float64
		want float64
		tol  float64
	}{
		{0, 1.0, 0.001},
		{-10, 0.5, 0.001},
		{10, 1.5, 0.001},
		{-20, 0.0, 0.001},
		{20, 2.0, 0.001},
		{-15, 0.16, 0.01},
		{15, 1.77, 0.01},
	}
	for _, c := range cases {
		got := itemstats.ElevationMultiplier(c.ee)
		assert.InDelta(t, c.want, got, c.tol, "ee=%v", c.ee)
	}
}

func TestElevationMultiplier_ZeroBelowNegative20(t *testing.T) {
	assert.Equal(t, 0.0, itemstats.ElevationMultiplier(-30))
}

func TestElevationMultiplier_Monotonic(t *testing.T) {
	var prev float64 = -1
	for ee := -20.0; ee <= 20.0; ee++ {
		got := itemstats.ElevationMultiplier(ee)
		assert.GreaterOrEqual(t, got, prev)
		prev = got
	}
}
