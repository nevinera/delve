package instance_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func spawnTestZone() instanceconfig.Zone {
	return instanceconfig.Zone{
		Name:        "Z",
		EntryPoints: map[string]*string{"first/gate": nil},
		Maps: []instanceconfig.Map{
			{
				Identifier:     "first",
				FeetDimensions: instanceconfig.Dimensions{Width: 100, Height: 100},
				Connections: []instanceconfig.MapConnection{
					{Identifier: "gate", Type: "point", Position: &instanceconfig.Position{X: 10, Y: 10}},
				},
			},
			{
				Identifier:     "second",
				FeetDimensions: instanceconfig.Dimensions{Width: 100, Height: 100},
				Connections: []instanceconfig.MapConnection{
					{Identifier: "well", Type: "point", Position: &instanceconfig.Position{X: 70, Y: 30}},
					// A line along the top edge: spawns 4ft toward the center.
					{Identifier: "north", Type: "line", Start: &instanceconfig.Location{X: 40, Y: 0}, End: &instanceconfig.Location{X: 60, Y: 0}},
				},
			},
		},
	}
}

func TestSpawnPlacement_PointConnection(t *testing.T) {
	mapID, pos := instance.SpawnPlacementForTest(spawnTestZone(), "second/well")
	assert.Equal(t, "second", mapID)
	assert.Equal(t, instanceconfig.Position{X: 70, Y: 30}, pos)
}

func TestSpawnPlacement_LineConnectionNudgedInward(t *testing.T) {
	mapID, pos := instance.SpawnPlacementForTest(spawnTestZone(), "second/north")
	assert.Equal(t, "second", mapID)
	assert.InDelta(t, 50, pos.X, 0.001)
	assert.InDelta(t, 4, pos.Y, 0.001)
}

func TestSpawnPlacement_FallsBackToEntryPosition(t *testing.T) {
	for _, spawnAt := range []string{"", "second/nowhere", "nowhere/well", "garbage"} {
		mapID, pos := instance.SpawnPlacementForTest(spawnTestZone(), spawnAt)
		assert.Equal(t, "first", mapID, spawnAt)
		assert.Equal(t, instanceconfig.Position{X: 10, Y: 10}, pos, spawnAt)
	}
}

func TestPlayerSpawn_UsesSlotSpawnAt(t *testing.T) {
	reg := instance.NewRegistry()
	inst := instance.NewInstance(uuid.New(), "db-1", "zone", "v1", "http://x", spawnTestZone(), instance.DefaultMaxSlots)
	require.NoError(t, inst.Start(reg))
	t.Cleanup(inst.Stop)

	slot, err := inst.AddSlotWithOptions("Aldric", "42", puncherClass, nil, nil, instance.SlotOptions{SpawnAt: "second/well"})
	require.NoError(t, err)
	writeCh, _, done, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done) })

	unit := receiveFullState(t, writeCh)[slot.CharacterUnitID.String()]
	require.NotNil(t, unit)
	assert.Equal(t, "second", unit["map_identifier"])
	pos := unit["position"].(map[string]any)
	assert.Equal(t, 70.0, pos["x"])
	assert.Equal(t, 30.0, pos["y"])
}
