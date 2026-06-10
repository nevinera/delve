package instance_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// goblinZone builds a minimal zone with a single goblin unit at the origin.
func goblinZone() instanceconfig.Zone {
	return instanceconfig.Zone{
		Name:    "Test Zone",
		Private: true,
		Maps: []instanceconfig.Map{{
			Identifier: "m1",
			Name:       "Map 1",
			Units:      []instanceconfig.Unit{{Identifier: "goblin_a", UnitType: "goblin"}},
		}},
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {
				Name:        "Goblin",
				TokenRadius: 1.0,
				MaxHP:       100,
				Resource:    instanceconfig.ResourceType{Name: "Energy", Max: 50, DefaultValue: 25},
				Targeting:   instanceconfig.UnitTargeting{Type: "nearest"},
				Tactics:     instanceconfig.UnitTactics{Type: "randomAvailable"},
			},
		},
	}
}

// startedGoblinInstance creates and starts an instance with a single goblin.
func startedGoblinInstance(t *testing.T) *instance.Instance {
	t.Helper()
	inst := instance.NewInstance(
		uuid.New(), "db-1", "zone-test", "v1", "http://x",
		goblinZone(),
		instance.DefaultMaxSlots,
	)
	require.NoError(t, inst.Start())
	t.Cleanup(inst.Stop)
	return inst
}

// readMsg reads one message from writeCh within 500ms or fails.
func readMsg(t *testing.T, ch chan []byte) map[string]any {
	t.Helper()
	select {
	case raw := <-ch:
		var msg map[string]any
		require.NoError(t, json.Unmarshal(raw, &msg))
		return msg
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timed out waiting for message from tick loop")
		return nil
	}
}

// stateWithUnit returns a fresh InstanceState from goblinZone.
func stateWithUnit(t *testing.T) *instancestate.InstanceState {
	t.Helper()
	s, err := instancestate.NewInstanceState(goblinZone())
	require.NoError(t, err)
	return s
}

func delta(t *testing.T, prev, curr *instancestate.InstanceState) map[string]any {
	t.Helper()
	raw, err := instance.BuildDeltaMsgForTest(prev, curr, time.Now(), "test-checksum")
	require.NoError(t, err)
	var msg map[string]any
	require.NoError(t, json.Unmarshal(raw, &msg))
	return msg
}

func fullState(t *testing.T, state *instancestate.InstanceState) map[string]any {
	t.Helper()
	raw, err := instance.BuildFullStateMsgForTest(state, time.Now(), "test-checksum")
	require.NoError(t, err)
	var msg map[string]any
	require.NoError(t, json.Unmarshal(raw, &msg))
	return msg
}

// ---------------------------------------------------------------------------
// buildFullStateMsg
// ---------------------------------------------------------------------------

func TestFullStateMsg_Shape(t *testing.T) {
	msg := fullState(t, stateWithUnit(t))

	assert.Equal(t, "down", msg["direction"])
	assert.Equal(t, "instance-state", msg["type"])
	assert.Equal(t, "test-checksum", msg["checksum"])
	assert.NotZero(t, msg["timestamp"])
	assert.NotNil(t, msg["units"])
}

func TestFullStateMsg_UnitFields(t *testing.T) {
	msg := fullState(t, stateWithUnit(t))
	units := msg["units"].(map[string]any)
	require.Len(t, units, 1)

	for _, u := range units {
		unit := u.(map[string]any)
		assert.Equal(t, "goblin_a", unit["zone_unit_identifier"])
		assert.Equal(t, "m1", unit["map_identifier"])
		assert.Equal(t, "idle", unit["status"])
		assert.Equal(t, float64(100), unit["health"])
		assert.Equal(t, float64(100), unit["max_health"])
		assert.Nil(t, unit["target"])
		assert.NotNil(t, unit["active_status_effects"])
	}
}

func TestFullStateMsg_EmptyState(t *testing.T) {
	empty := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{}}
	msg := fullState(t, empty)
	assert.Empty(t, msg["units"])
}

// ---------------------------------------------------------------------------
// buildDeltaMsg
// ---------------------------------------------------------------------------

func TestDeltaMsg_Shape(t *testing.T) {
	s := stateWithUnit(t)
	msg := delta(t, s, s.Clone())

	assert.Equal(t, "down", msg["direction"])
	assert.Equal(t, "delta", msg["type"])
	assert.Equal(t, "test-checksum", msg["checksum"])
	assert.NotZero(t, msg["timestamp"])
}

func TestDeltaMsg_NothingChanged(t *testing.T) {
	s := stateWithUnit(t)
	msg := delta(t, s, s.Clone())

	assert.Empty(t, msg["unit_updates"])
	assert.Empty(t, msg["unit_removals"])
	assert.Empty(t, msg["effect_adds"])
	assert.Empty(t, msg["effect_removes"])
}

func TestDeltaMsg_HealthChanged(t *testing.T) {
	prev := stateWithUnit(t)
	curr := prev.Clone()
	for _, u := range curr.Units {
		u.Health = 50
	}

	msg := delta(t, prev, curr)
	updates := msg["unit_updates"].(map[string]any)
	require.Len(t, updates, 1)
	for _, patch := range updates {
		p := patch.(map[string]any)
		assert.Equal(t, float64(50), p["health"])
		_, hasPos := p["position"]
		assert.False(t, hasPos, "unchanged position should be omitted")
	}
}

func TestDeltaMsg_PositionChanged(t *testing.T) {
	prev := stateWithUnit(t)
	curr := prev.Clone()
	for _, u := range curr.Units {
		u.Position = instanceconfig.Position{X: 99, Y: 99, Angle: 45}
	}

	msg := delta(t, prev, curr)
	updates := msg["unit_updates"].(map[string]any)
	require.Len(t, updates, 1)
	for _, patch := range updates {
		p := patch.(map[string]any)
		pos := p["position"].(map[string]any)
		assert.Equal(t, float64(99), pos["x"])
	}
}

func TestDeltaMsg_EffectAdded(t *testing.T) {
	prev := stateWithUnit(t)
	curr := prev.Clone()
	expires := time.Date(2030, 1, 1, 0, 0, 5, 0, time.UTC)
	for _, u := range curr.Units {
		u.ActiveStatusEffects = []instancestate.ActiveStatusEffect{
			{StatusIdentifier: "poison", ExpiresAt: expires},
		}
	}

	msg := delta(t, prev, curr)
	adds := msg["effect_adds"].([]any)
	require.Len(t, adds, 1)
	add := adds[0].(map[string]any)
	assert.Equal(t, "poison", add["status_identifier"])
	assert.Equal(t, float64(expires.UnixMilli()), add["expires_at"])
	assert.Empty(t, msg["effect_removes"])
}

func TestDeltaMsg_EffectRemoved(t *testing.T) {
	prev := stateWithUnit(t)
	expires := time.Date(2030, 1, 1, 0, 0, 5, 0, time.UTC)
	for _, u := range prev.Units {
		u.ActiveStatusEffects = []instancestate.ActiveStatusEffect{
			{StatusIdentifier: "slow", ExpiresAt: expires},
		}
	}
	curr := prev.Clone()
	for _, u := range curr.Units {
		u.ActiveStatusEffects = nil
	}

	msg := delta(t, prev, curr)
	removes := msg["effect_removes"].([]any)
	require.Len(t, removes, 1)
	rem := removes[0].(map[string]any)
	assert.Equal(t, "slow", rem["status_identifier"])
	assert.Empty(t, msg["effect_adds"])
}

func TestDeltaMsg_NewUnit(t *testing.T) {
	prev := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{}}
	curr := stateWithUnit(t)

	msg := delta(t, prev, curr)
	updates := msg["unit_updates"].(map[string]any)
	require.Len(t, updates, 1)
	for _, u := range updates {
		p := u.(map[string]any)
		assert.Equal(t, "goblin_a", p["zone_unit_identifier"])
	}
}

func TestDeltaMsg_RemovedUnit(t *testing.T) {
	prev := stateWithUnit(t)
	curr := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{}}

	msg := delta(t, prev, curr)
	removals := msg["unit_removals"].([]any)
	assert.Len(t, removals, 1)
	assert.Empty(t, msg["unit_updates"])
}

// ---------------------------------------------------------------------------
// Tick loop integration — full state and delta via writeCh
// ---------------------------------------------------------------------------

func TestTick_SendsFullStateOnConnect(t *testing.T) {
	inst := startedGoblinInstance(t)
	slot, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)

	writeCh, _, done, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done) })

	msg := readMsg(t, writeCh)
	assert.Equal(t, "down", msg["direction"])
	assert.Equal(t, "instance-state", msg["type"])
	assert.NotEmpty(t, msg["checksum"])
	units := msg["units"].(map[string]any)
	assert.Len(t, units, 1)
}

func TestTick_FullStateChecksum_MatchesInstance(t *testing.T) {
	inst := startedGoblinInstance(t)
	slot, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)

	writeCh, _, done, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done) })

	msg := readMsg(t, writeCh)
	require.Equal(t, "instance-state", msg["type"])
	assert.Equal(t, inst.Checksum, msg["checksum"])
}

func TestTick_SendsDeltaAfterFullState(t *testing.T) {
	inst := startedGoblinInstance(t)
	slot, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)

	writeCh, _, done, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done) })

	first := readMsg(t, writeCh)
	require.Equal(t, "instance-state", first["type"])

	second := readMsg(t, writeCh)
	assert.Equal(t, "delta", second["type"])
	assert.Equal(t, "down", second["direction"])
}

func TestTick_Delta_EmptyWhenStateUnchanged(t *testing.T) {
	inst := startedGoblinInstance(t)
	slot, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)

	writeCh, _, done, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done) })

	// Drain full state.
	first := readMsg(t, writeCh)
	require.Equal(t, "instance-state", first["type"])

	delta := readMsg(t, writeCh)
	require.Equal(t, "delta", delta["type"])
	assert.Empty(t, delta["unit_updates"])
	assert.Empty(t, delta["unit_removals"])
	assert.Empty(t, delta["effect_adds"])
	assert.Empty(t, delta["effect_removes"])
}

func TestTick_ReconnectGetsFreshFullState(t *testing.T) {
	inst := startedGoblinInstance(t)
	slot, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)

	// First connection — drain full state and a delta.
	ch1, ctx1, done1, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	readMsg(t, ch1) // full state
	go func() { <-ctx1.Done(); close(done1) }()

	// Second connection should also receive a fresh full state.
	ch2, _, done2, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done2) })

	msg := readMsg(t, ch2)
	assert.Equal(t, "instance-state", msg["type"])
}
