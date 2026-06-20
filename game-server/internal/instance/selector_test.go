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
	require.NoError(t, inst.Start(nil))
	t.Cleanup(inst.Stop)
	return inst
}

func addSlots(t *testing.T, inst *instance.Instance, n int) {
	t.Helper()
	for i := range n {
		_, err := inst.AddSlot(string(rune('A'+i)), instanceconfig.CharacterClass{Name: "Puncher"})
		require.NoError(t, err)
	}
}

func TestSelectBestInstance_ReturnsNilWhenNoCandidates(t *testing.T) {
	result := instance.SelectBestInstance(nil, "zone-a", "v1")
	assert.Nil(t, result)
}

func TestSelectBestInstance_ReturnsNilWhenNoMatch(t *testing.T) {
	inst := makeSelectableInstance(t, "zone-a", "v1", 10)
	result := instance.SelectBestInstance([]*instance.Instance{inst}, "zone-b", "v1")
	assert.Nil(t, result)
}

func TestSelectBestInstance_ReturnsNilWhenVersionMismatch(t *testing.T) {
	inst := makeSelectableInstance(t, "zone-a", "v1", 10)
	result := instance.SelectBestInstance([]*instance.Instance{inst}, "zone-a", "v2")
	assert.Nil(t, result)
}

func TestSelectBestInstance_ReturnsNilWhenFull(t *testing.T) {
	inst := makeSelectableInstance(t, "zone-a", "v1", 2)
	addSlots(t, inst, 2)
	result := instance.SelectBestInstance([]*instance.Instance{inst}, "zone-a", "v1")
	assert.Nil(t, result)
}

func TestSelectBestInstance_ReturnsNilWhenNotActive(t *testing.T) {
	inst := makeSelectableInstance(t, "zone-a", "v1", 10)
	inst.Stop()
	result := instance.SelectBestInstance([]*instance.Instance{inst}, "zone-a", "v1")
	assert.Nil(t, result)
}

func TestSelectBestInstance_ReturnsSingleMatch(t *testing.T) {
	inst := makeSelectableInstance(t, "zone-a", "v1", 10)
	result := instance.SelectBestInstance([]*instance.Instance{inst}, "zone-a", "v1")
	assert.Equal(t, inst, result)
}

func TestSelectBestInstance_PrefersFullest(t *testing.T) {
	sparse := makeSelectableInstance(t, "zone-a", "v1", 10)
	addSlots(t, sparse, 1)

	full := makeSelectableInstance(t, "zone-a", "v1", 10)
	addSlots(t, full, 5)

	result := instance.SelectBestInstance([]*instance.Instance{sparse, full}, "zone-a", "v1")
	assert.Equal(t, full, result)
}

func TestSelectBestInstance_PrefersNewestAmongTies(t *testing.T) {
	older := makeSelectableInstance(t, "zone-a", "v1", 10)
	addSlots(t, older, 3)

	// Ensure a measurable gap between creation times.
	time.Sleep(2 * time.Millisecond)

	newer := makeSelectableInstance(t, "zone-a", "v1", 10)
	addSlots(t, newer, 3)

	result := instance.SelectBestInstance([]*instance.Instance{older, newer}, "zone-a", "v1")
	assert.Equal(t, newer, result)
}

func TestSelectBestInstance_IgnoresOtherZones(t *testing.T) {
	other := makeSelectableInstance(t, "zone-b", "v1", 10)
	addSlots(t, other, 8)

	target := makeSelectableInstance(t, "zone-a", "v1", 10)
	addSlots(t, target, 2)

	result := instance.SelectBestInstance([]*instance.Instance{other, target}, "zone-a", "v1")
	assert.Equal(t, target, result)
}
