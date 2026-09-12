package pathing

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func TestBuild_OneMapGraphPerMap(t *testing.T) {
	zone := instanceconfig.Zone{
		Maps: []instanceconfig.Map{
			{Identifier: "map1"},
			{Identifier: "map2", Barriers: []instanceconfig.Barrier{circleBarrier(5, 0, 2)}},
		},
	}

	g, err := Build(zone, 0.5)
	require.NoError(t, err)

	_, ok := g.FindPath("map1", 0, 0, 10, 0)
	assert.True(t, ok)

	_, ok = g.FindPath("map2", 0, 0, 10, 0)
	assert.True(t, ok, "should route around the circle, not just fail")

	_, ok = g.FindPath("no-such-map", 0, 0, 10, 0)
	assert.False(t, ok)
}

func TestMaxUnitRadius(t *testing.T) {
	zone := instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"rat":   {TokenRadius: 1},
			"ogre":  {TokenRadius: 5},
			"ghost": {TokenRadius: 2},
		},
	}
	m := instanceconfig.Map{
		Units: []instanceconfig.Unit{
			{UnitType: "rat"},
			{UnitType: "ogre"},
			{UnitType: "unknown-type"},
		},
	}

	assert.Equal(t, 5.0, MaxUnitRadius(zone, m, 1))
}

func TestMaxUnitRadius_NoUnitsUsesFallback(t *testing.T) {
	zone := instanceconfig.Zone{}
	m := instanceconfig.Map{}
	assert.Equal(t, 1.5, MaxUnitRadius(zone, m, 1.5))
}
