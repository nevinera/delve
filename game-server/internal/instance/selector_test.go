package instance_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// makeSelectableInstance starts a direct-mode instance keyed by zone +
// version (see selectFor).
func makeSelectableInstance(t *testing.T, zoneID, version string, maxSlots int) *instance.Instance {
	t.Helper()
	inst := instance.NewInstance(
		uuid.New(), "db-1", zoneID, version, "http://x",
		instanceconfig.Zone{Name: "Z", Maps: []instanceconfig.Map{{
			Identifier:     "m",
			Name:           "M",
			FeetDimensions: instanceconfig.Dimensions{Width: 20, Height: 20},
		}}},
		maxSlots,
	)
	inst.Mode = instance.ModeDirect
	inst.InstanceKey = zoneID + "@" + version
	require.NoError(t, inst.Start(nil))
	t.Cleanup(inst.Stop)
	return inst
}

func selectFor(candidates []*instance.Instance, zoneID, version string) *instance.Instance {
	return instance.SelectKeyedInstance(candidates, instance.ModeDirect, zoneID+"@"+version)
}

func addSlots(t *testing.T, inst *instance.Instance, n int) {
	t.Helper()
	for i := range n {
		_, err := inst.AddSlot(string(rune('A'+i)), "42", instanceconfig.CharacterClass{Name: "Puncher"}, nil, nil)
		require.NoError(t, err)
	}
}

func TestSelectKeyedInstance_ReturnsNilWhenNoCandidates(t *testing.T) {
	result := selectFor(nil, "zone-a", "v1")
	assert.Nil(t, result)
}

func TestSelectKeyedInstance_ReturnsNilWhenNoMatch(t *testing.T) {
	inst := makeSelectableInstance(t, "zone-a", "v1", 10)
	result := selectFor([]*instance.Instance{inst}, "zone-b", "v1")
	assert.Nil(t, result)
}

func TestSelectKeyedInstance_ReturnsNilWhenVersionMismatch(t *testing.T) {
	inst := makeSelectableInstance(t, "zone-a", "v1", 10)
	result := selectFor([]*instance.Instance{inst}, "zone-a", "v2")
	assert.Nil(t, result)
}

func TestSelectKeyedInstance_ReturnsNilWhenFull(t *testing.T) {
	inst := makeSelectableInstance(t, "zone-a", "v1", 2)
	addSlots(t, inst, 2)
	result := selectFor([]*instance.Instance{inst}, "zone-a", "v1")
	assert.Nil(t, result)
}

func TestSelectKeyedInstance_ReturnsNilWhenNotActive(t *testing.T) {
	inst := makeSelectableInstance(t, "zone-a", "v1", 10)
	inst.Stop()
	result := selectFor([]*instance.Instance{inst}, "zone-a", "v1")
	assert.Nil(t, result)
}

func TestSelectKeyedInstance_ReturnsSingleMatch(t *testing.T) {
	inst := makeSelectableInstance(t, "zone-a", "v1", 10)
	result := selectFor([]*instance.Instance{inst}, "zone-a", "v1")
	assert.Equal(t, inst, result)
}

func TestSelectKeyedInstance_PrefersFullest(t *testing.T) {
	sparse := makeSelectableInstance(t, "zone-a", "v1", 10)
	addSlots(t, sparse, 1)

	full := makeSelectableInstance(t, "zone-a", "v1", 10)
	addSlots(t, full, 5)

	result := selectFor([]*instance.Instance{sparse, full}, "zone-a", "v1")
	assert.Equal(t, full, result)
}

func TestSelectKeyedInstance_PrefersNewestAmongTies(t *testing.T) {
	older := makeSelectableInstance(t, "zone-a", "v1", 10)
	addSlots(t, older, 3)

	// Ensure a measurable gap between creation times.
	time.Sleep(2 * time.Millisecond)

	newer := makeSelectableInstance(t, "zone-a", "v1", 10)
	addSlots(t, newer, 3)

	result := selectFor([]*instance.Instance{older, newer}, "zone-a", "v1")
	assert.Equal(t, newer, result)
}

func TestSelectKeyedInstance_IgnoresOtherZones(t *testing.T) {
	other := makeSelectableInstance(t, "zone-b", "v1", 10)
	addSlots(t, other, 8)

	target := makeSelectableInstance(t, "zone-a", "v1", 10)
	addSlots(t, target, 2)

	result := selectFor([]*instance.Instance{other, target}, "zone-a", "v1")
	assert.Equal(t, target, result)
}
