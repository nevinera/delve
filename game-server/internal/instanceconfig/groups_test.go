package instanceconfig_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func TestGroupedUnits_SharedGroupOnSameMap(t *testing.T) {
	zone := instanceconfig.Zone{
		Maps: []instanceconfig.Map{{
			Identifier: "map1",
			Units: []instanceconfig.Unit{
				{Identifier: "a", GroupIdentifier: "pack"},
				{Identifier: "b", GroupIdentifier: "pack"},
				{Identifier: "c", GroupIdentifier: "pack"},
				{Identifier: "solo"},
			},
		}},
	}

	groups := instanceconfig.GroupedUnits(zone)

	assert.ElementsMatch(t, []string{"b", "c"}, groups["a"])
	assert.ElementsMatch(t, []string{"a", "c"}, groups["b"])
	assert.ElementsMatch(t, []string{"a", "b"}, groups["c"])
	assert.Empty(t, groups["solo"])
}

func TestGroupedUnits_SameIdentifierDifferentMapsDoesNotGroup(t *testing.T) {
	zone := instanceconfig.Zone{
		Maps: []instanceconfig.Map{
			{Identifier: "map1", Units: []instanceconfig.Unit{{Identifier: "a", GroupIdentifier: "pack"}}},
			{Identifier: "map2", Units: []instanceconfig.Unit{{Identifier: "b", GroupIdentifier: "pack"}}},
		},
	}

	groups := instanceconfig.GroupedUnits(zone)

	assert.Empty(t, groups["a"])
	assert.Empty(t, groups["b"])
}
