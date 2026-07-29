package instancestate

import (
	"fmt"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// InstanceState is the full runtime state of one zone instance.
// It is pure data: the tick system reads and writes it; no behavior lives here.
type InstanceState struct {
	Units map[uuid.UUID]*UnitState
}

// NewInstanceState constructs an InstanceState from a zone config, placing every
// unit at its starting position with full health and its resource at DefaultValue.
// Returns an error if any unit is missing its identifier, reuses an identifier
// already seen in this zone, or references an unknown unit type.
func NewInstanceState(zone instanceconfig.Zone) (*InstanceState, error) {
	state := &InstanceState{
		Units: make(map[uuid.UUID]*UnitState),
	}
	seen := make(map[string]string) // identifier → map identifier where first seen
	for _, m := range zone.Maps {
		for _, u := range m.Units {
			if u.Identifier == "" {
				return nil, fmt.Errorf(
					"unit on map %q has no identifier; all units must have identifiers for game server use",
					m.Identifier,
				)
			}
			if first, dup := seen[u.Identifier]; dup {
				return nil, fmt.Errorf(
					"unit identifier %q appears on both map %q and map %q; identifiers must be unique across the zone",
					u.Identifier, first, m.Identifier,
				)
			}
			seen[u.Identifier] = m.Identifier
			ut, ok := zone.UnitTypes[u.UnitType]
			if !ok {
				return nil, fmt.Errorf(
					"unit %q on map %q references unknown unit type %q",
					u.Identifier, m.Identifier, u.UnitType,
				)
			}
			hpFraction := u.CurrentHPFraction
			if hpFraction == 0 {
				hpFraction = 1.0
			}
			id := uuid.New()
			state.Units[id] = &UnitState{
				ZoneUnitIdentifier:  u.Identifier,
				UnitTypeIdentifier:  u.UnitType,
				MapIdentifier:       m.Identifier,
				Hostility:           u.Hostility,
				Position:            u.Position,
				SpawnPoint:          u.Position,
				Health:              float64(ut.MaxHP) * hpFraction,
				MaxHealth:           float64(ut.MaxHP),
				Resource:            ut.Resource.DefaultValue,
				MaxResource:         ut.Resource.Max,
				Radius:              ut.TokenRadius,
				Status:              UnitStatusIdle,
				Target:              nil,
				ActiveStatusEffects: []ActiveStatusEffect{},
				Behavior:            BehaviorState{},
			}
		}
	}
	return state, nil
}
