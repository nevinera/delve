package instance_test

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// makeZoneWithMap returns a minimal zone whose first map has the given dimensions.
func makeZoneWithMap(width, height float64) instanceconfig.Zone {
	return instanceconfig.Zone{
		Name:    "Test Zone",
		Private: true,
		Maps: []instanceconfig.Map{{
			Identifier:     "m1",
			Name:           "Map 1",
			FeetDimensions: instanceconfig.Dimensions{Width: width, Height: height},
		}},
	}
}

// receiveFullState waits for a full instance-state message on writeCh and
// returns the parsed units map.
func receiveFullState(t *testing.T, writeCh chan []byte) map[string]map[string]any {
	t.Helper()
	select {
	case msg := <-writeCh:
		var parsed struct {
			Type  string                    `json:"type"`
			Units map[string]map[string]any `json:"units"`
		}
		require.NoError(t, json.Unmarshal(msg, &parsed))
		require.Equal(t, "instance-state", parsed.Type, "expected full state message")
		return parsed.Units
	case <-time.After(500 * time.Millisecond):
		t.Fatal("no full state message received within deadline")
		return nil
	}
}

func TestAddSlot_AssignsCharacterUnitID(t *testing.T) {
	inst := makeInstance()
	slot, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)

	assert.NotEqual(t, uuid.Nil, slot.CharacterUnitID)
	assert.NotEqual(t, slot.ID, slot.CharacterUnitID)
	assert.NotEqual(t, slot.Token, slot.CharacterUnitID)
}

func TestAddSlot_UniqueCharacterUnitIDs(t *testing.T) {
	inst := makeInstance()
	a, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)
	b, err := inst.AddSlot("Brego", puncherClass)
	require.NoError(t, err)

	assert.NotEqual(t, a.CharacterUnitID, b.CharacterUnitID)
}

func TestPlayerSpawn_AppearsInFullState(t *testing.T) {
	reg := instance.NewRegistry()
	inst := startedInstance(t, reg)
	t.Cleanup(inst.Stop)

	slot, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)

	writeCh, _, done, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done) })

	units := receiveFullState(t, writeCh)

	var found bool
	for _, u := range units {
		if u["zone_unit_identifier"] == "player:Aldric" {
			found = true
		}
	}
	assert.True(t, found, "player unit should appear in full state message")
}

func TestPlayerSpawn_UsesFirstMapCenter(t *testing.T) {
	reg := instance.NewRegistry()
	inst := instance.NewInstance(
		uuid.New(), "db-1", "zone-test", "v1", "http://example.com",
		makeZoneWithMap(100, 80),
		instance.DefaultMaxSlots,
	)
	inst.EmptyTimeout = shortTimeout
	inst.SlotWaitTimeout = shortTimeout
	require.NoError(t, inst.Start(reg))
	reg.Add(inst)
	t.Cleanup(inst.Stop)

	slot, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)

	writeCh, _, done, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done) })

	units := receiveFullState(t, writeCh)

	for _, u := range units {
		if u["zone_unit_identifier"] == "player:Aldric" {
			pos := u["position"].(map[string]any)
			assert.Equal(t, 50.0, pos["x"])
			assert.Equal(t, 40.0, pos["y"])
			return
		}
	}
	t.Fatal("player unit not found in full state")
}

func TestPlayerSpawn_ReconnectDoesNotDuplicate(t *testing.T) {
	reg := instance.NewRegistry()
	inst := startedInstance(t, reg)
	t.Cleanup(inst.Stop)

	slot, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)

	// First connection.
	_, ctx1, done1, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	go func() { <-ctx1.Done(); close(done1) }()

	// Second connection displaces the first.
	writeCh2, _, done2, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done2) })

	units := receiveFullState(t, writeCh2)

	var playerCount int
	for _, u := range units {
		if id, ok := u["zone_unit_identifier"].(string); ok && strings.HasPrefix(id, "player:") {
			playerCount++
		}
	}
	assert.Equal(t, 1, playerCount, "exactly one player unit should exist after reconnect")
}
