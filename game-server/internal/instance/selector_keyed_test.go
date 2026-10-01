package instance_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func makeKeyedInstance(t *testing.T, mode instance.Mode, key string, maxSlots int) *instance.Instance {
	t.Helper()
	inst := instance.NewInstance(
		uuid.New(), "db-1", "zone-a", "v1", "http://x",
		instanceconfig.Zone{Name: "Z", Maps: []instanceconfig.Map{{
			Identifier:     "m",
			Name:           "M",
			FeetDimensions: instanceconfig.Dimensions{Width: 20, Height: 20},
		}}},
		maxSlots,
	)
	inst.Mode = mode
	inst.InstanceKey = key
	require.NoError(t, inst.Start(nil))
	t.Cleanup(inst.Stop)
	return inst
}

func TestSelectKeyedInstance_MatchesModeAndKey(t *testing.T) {
	match := makeKeyedInstance(t, instance.ModeWorld, "world:1", 10)
	otherKey := makeKeyedInstance(t, instance.ModeWorld, "world:2", 10)
	otherMode := makeKeyedInstance(t, instance.ModeDirect, "world:1", 10)
	candidates := []*instance.Instance{otherKey, otherMode, match}

	assert.Same(t, match, instance.SelectKeyedInstance(candidates, instance.ModeWorld, "world:1"))
	assert.Nil(t, instance.SelectKeyedInstance(candidates, instance.ModeWorld, "world:3"))
}

func TestSelectKeyedInstance_PrefersFullestWithRoom(t *testing.T) {
	emptier := makeKeyedInstance(t, instance.ModeWorld, "world:1", 10)
	fuller := makeKeyedInstance(t, instance.ModeWorld, "world:1", 10)
	full := makeKeyedInstance(t, instance.ModeWorld, "world:1", 2)
	addSlots(t, fuller, 1)
	addSlots(t, full, 2)

	assert.Same(t, fuller, instance.SelectKeyedInstance([]*instance.Instance{emptier, fuller, full}, instance.ModeWorld, "world:1"))
}
