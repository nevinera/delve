package instancestate_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instancestate"
	"github.com/delve-mmo/game-server/internal/zoneconfig"
)

func stateFromZone(t *testing.T, zone zoneconfig.Zone) *instancestate.InstanceState {
	t.Helper()
	state, err := instancestate.NewInstanceState(zone)
	if err != nil {
		t.Fatalf("NewInstanceState: %v", err)
	}
	return state
}

func singleUnitState(t *testing.T) *instancestate.InstanceState {
	t.Helper()
	return stateFromZone(t, zoneWith(zoneconfig.Unit{
		Identifier: "goblin_a",
		UnitType:   "goblin",
		Position:   zoneconfig.Position{X: 10, Y: 20, Angle: 90},
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
	zone := zoneWith(zoneconfig.Unit{Identifier: "goblin_a", UnitType: "goblin"})
	full := stateFromZone(t, zone)
	damaged := stateFromZone(t, zone)
	for _, u := range damaged.Units {
		u.Health = 50
	}
	assert.NotEqual(t, full.Checksum(), damaged.Checksum())
}

func TestChecksum_DifferentPosition(t *testing.T) {
	zone := zoneWith(zoneconfig.Unit{Identifier: "goblin_a", UnitType: "goblin"})
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
	zone := zoneWith(zoneconfig.Unit{Identifier: "goblin_a", UnitType: "goblin"})
	without := stateFromZone(t, zone)
	with := stateFromZone(t, zone)
	for _, u := range with.Units {
		u.ActiveStatusEffects = []instancestate.ActiveStatusEffect{
			{StatusIdentifier: "poison", RemainingDuration: 3.0},
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

	ab := makeStateWithEffects([]instancestate.ActiveStatusEffect{
		{StatusIdentifier: "poison", RemainingDuration: 3.0},
		{StatusIdentifier: "slow", RemainingDuration: 1.0},
	})
	ba := makeStateWithEffects([]instancestate.ActiveStatusEffect{
		{StatusIdentifier: "slow", RemainingDuration: 1.0},
		{StatusIdentifier: "poison", RemainingDuration: 3.0},
	})
	assert.Equal(t, ab.Checksum(), ba.Checksum())
}
