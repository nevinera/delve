package instanceconfig_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func ptr[T any](v T) *T { return &v }

func TestUnitLeash_Defaults(t *testing.T) {
	assert.Equal(t, instanceconfig.Leash{Radius: instanceconfig.DefaultLeashRadius}, instanceconfig.UnitLeash(instanceconfig.Map{}, instanceconfig.Unit{}))
}

func TestUnitLeash_MapOverridesDefault(t *testing.T) {
	m := instanceconfig.Map{LeashRadius: ptr(60.0), HardLeash: ptr(true)}
	assert.Equal(t, instanceconfig.Leash{Radius: 60, Hard: true}, instanceconfig.UnitLeash(m, instanceconfig.Unit{}))
}

func TestUnitLeash_UnitOverridesMap(t *testing.T) {
	m := instanceconfig.Map{LeashRadius: ptr(60.0), HardLeash: ptr(true)}
	u := instanceconfig.Unit{LeashRadius: ptr(30.0), HardLeash: ptr(false)}
	assert.Equal(t, instanceconfig.Leash{Radius: 30, Hard: false}, instanceconfig.UnitLeash(m, u))
}

func TestUnitLeash_UnitOverridesOnlyWhatItSets(t *testing.T) {
	m := instanceconfig.Map{LeashRadius: ptr(60.0)}
	u := instanceconfig.Unit{HardLeash: ptr(true)}
	assert.Equal(t, instanceconfig.Leash{Radius: 60, Hard: true}, instanceconfig.UnitLeash(m, u))
}
