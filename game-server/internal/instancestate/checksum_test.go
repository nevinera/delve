package instancestate_test

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func stateFromZone(t *testing.T, zone instanceconfig.Zone) *instancestate.InstanceState {
	t.Helper()
	state, err := instancestate.NewInstanceState(zone)
	if err != nil {
		t.Fatalf("NewInstanceState: %v", err)
	}
	return state
}

func singleUnitState(t *testing.T) *instancestate.InstanceState {
	t.Helper()
	return stateFromZone(t, zoneWith(instanceconfig.Unit{
		Identifier: "goblin_a",
		UnitType:   "goblin",
		Position:   instanceconfig.Position{X: 10, Y: 20, Angle: 90},
	}))
}

func TestChecksum_NonEmpty(t *testing.T) {
	assert.NotEmpty(t, singleUnitState(t).Checksum())
}

func TestChecksum_Stable(t *testing.T) {
	state := singleUnitState(t)
	assert.Equal(t, state.Checksum(), state.Checksum())
}

func TestChecksum_EmptyState(t *testing.T) {
	empty := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{}}
	assert.NotEmpty(t, empty.Checksum())
	assert.Equal(t, empty.Checksum(), empty.Checksum())
}

func TestChecksum_DifferentHealth(t *testing.T) {
	zone := zoneWith(instanceconfig.Unit{Identifier: "goblin_a", UnitType: "goblin"})
	full := stateFromZone(t, zone)
	damaged := stateFromZone(t, zone)
	for _, u := range damaged.Units {
		u.Health = 50
	}
	assert.NotEqual(t, full.Checksum(), damaged.Checksum())
}

func TestChecksum_DifferentPosition(t *testing.T) {
	zone := zoneWith(instanceconfig.Unit{Identifier: "goblin_a", UnitType: "goblin"})
	original := stateFromZone(t, zone)
	moved := stateFromZone(t, zone)
	for _, u := range moved.Units {
		u.Position.X = 99
	}
	assert.NotEqual(t, original.Checksum(), moved.Checksum())
}

func TestChecksum_UnitOrderIndependent(t *testing.T) {
	// Two states with the same units but different map insertion order
	// must produce the same checksum.
	makeState := func(first, second string) *instancestate.InstanceState {
		state := &instancestate.InstanceState{
			Units: map[uuid.UUID]*instancestate.UnitState{},
		}
		for _, id := range []string{first, second} {
			state.Units[uuid.New()] = &instancestate.UnitState{
				ZoneUnitIdentifier:  id,
				MapIdentifier:       "m1",
				Health:              100,
				MaxHealth:           100,
				Resource:            25,
				MaxResource:         50,
				Status:              instancestate.UnitStatusIdle,
				ActiveStatusEffects: []instancestate.ActiveStatusEffect{},
			}
		}
		return state
	}

	assert.Equal(t,
		makeState("goblin_a", "goblin_b").Checksum(),
		makeState("goblin_b", "goblin_a").Checksum(),
	)
}

func TestChecksum_StatusEffectChangesChecksum(t *testing.T) {
	zone := zoneWith(instanceconfig.Unit{Identifier: "goblin_a", UnitType: "goblin"})
	without := stateFromZone(t, zone)
	with := stateFromZone(t, zone)
	for _, u := range with.Units {
		u.ActiveStatusEffects = []instancestate.ActiveStatusEffect{
			{StatusIdentifier: "poison", ExpiresAt: time.Date(2030, 1, 1, 0, 0, 3, 0, time.UTC)},
		}
	}
	assert.NotEqual(t, without.Checksum(), with.Checksum())
}

func TestChecksum_EffectsOrderIndependent(t *testing.T) {
	makeStateWithEffects := func(effects []instancestate.ActiveStatusEffect) *instancestate.InstanceState {
		return &instancestate.InstanceState{
			Units: map[uuid.UUID]*instancestate.UnitState{
				uuid.New(): {
					ZoneUnitIdentifier:  "goblin_a",
					MapIdentifier:       "m1",
					Health:              100,
					MaxHealth:           100,
					Resource:            25,
					MaxResource:         50,
					Status:              instancestate.UnitStatusIdle,
					ActiveStatusEffects: effects,
				},
			},
		}
	}

	t1 := time.Date(2030, 1, 1, 0, 0, 3, 0, time.UTC)
	t2 := time.Date(2030, 1, 1, 0, 0, 1, 0, time.UTC)
	ab := makeStateWithEffects([]instancestate.ActiveStatusEffect{
		{StatusIdentifier: "poison", ExpiresAt: t1},
		{StatusIdentifier: "slow", ExpiresAt: t2},
	})
	ba := makeStateWithEffects([]instancestate.ActiveStatusEffect{
		{StatusIdentifier: "slow", ExpiresAt: t2},
		{StatusIdentifier: "poison", ExpiresAt: t1},
	})
	assert.Equal(t, ab.Checksum(), ba.Checksum())
}

// TestChecksumParity loads a shared fixture (also used by the Ruby client spec)
// and asserts the Go checksum matches the expected value. If both tests pass,
// both implementations agree on the canonical form.
func TestChecksumParity(t *testing.T) {
	raw, err := os.ReadFile("testdata/checksum_parity.json")
	require.NoError(t, err)

	var fixture struct {
		ExpectedChecksum string `json:"expected_checksum"`
		Units            map[string]struct {
			ZoneUnitIdentifier  string  `json:"zone_unit_identifier"`
			MapIdentifier       string  `json:"map_identifier"`
			Position            struct {
				X     float64 `json:"x"`
				Y     float64 `json:"y"`
				Angle float64 `json:"angle"`
			} `json:"position"`
			Health              float64 `json:"health"`
			MaxHealth           float64 `json:"max_health"`
			Resource            float64 `json:"resource"`
			MaxResource         float64 `json:"max_resource"`
			Status              string  `json:"status"`
			ActiveStatusEffects []struct {
				StatusIdentifier string `json:"status_identifier"`
				ExpiresAt        int64  `json:"expires_at"`
			} `json:"active_status_effects"`
		} `json:"units"`
	}
	require.NoError(t, json.Unmarshal(raw, &fixture))

	state := &instancestate.InstanceState{Units: make(map[uuid.UUID]*instancestate.UnitState)}
	for idStr, u := range fixture.Units {
		id, err := uuid.Parse(idStr)
		require.NoError(t, err)
		effects := make([]instancestate.ActiveStatusEffect, len(u.ActiveStatusEffects))
		for i, e := range u.ActiveStatusEffects {
			effects[i] = instancestate.ActiveStatusEffect{
				StatusIdentifier: e.StatusIdentifier,
				ExpiresAt:        time.UnixMilli(e.ExpiresAt),
			}
		}
		state.Units[id] = &instancestate.UnitState{
			ZoneUnitIdentifier:  u.ZoneUnitIdentifier,
			MapIdentifier:       u.MapIdentifier,
			Position:            instanceconfig.Position{X: u.Position.X, Y: u.Position.Y, Angle: u.Position.Angle},
			Health:              u.Health,
			MaxHealth:           u.MaxHealth,
			Resource:            u.Resource,
			MaxResource:         u.MaxResource,
			Status:              instancestate.UnitStatus(u.Status),
			ActiveStatusEffects: effects,
		}
	}

	assert.Equal(t, fixture.ExpectedChecksum, state.Checksum())
}
