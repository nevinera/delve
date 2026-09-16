package instancestate

import (
	"fmt"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// LootEvent records items rolled when a unit dies, pending delivery to clients.
type LootEvent struct {
	UnitUUID uuid.UUID // direct key into InstanceState.Units
	UnitID   string    // zone unit identifier string (sent to client)
	Items    []instanceconfig.Item
}

// LootFailure records a loot award that the Rails API rejected, so the tick
// loop can notify the claiming player via the delta message.
type LootFailure struct {
	ClaimedBy uuid.UUID
	Item      instanceconfig.Item
}

// OwnershipUpdate records that a character confirmed as owning an item this
// zone version, so the tick loop can update the slot's OwnedZoneItems map.
type OwnershipUpdate struct {
	CharacterUnitID uuid.UUID
	ItemIdentifier  string
}

// PendingLootClaim is a newly-claimed item waiting for a goroutine to be
// fired. Populated by LootItemHandler; drained by the tick loop.
type PendingLootClaim struct {
	TargetUnitID uuid.UUID
	Claim        *LootClaim
	Item         instanceconfig.Item
}

// CombatEvent records a power use (including a basic-attack swing) by one
// unit against another, for client-side visual/audio playback. Not derived
// from a state diff, so it's carried separately in the delta message.
type CombatEvent struct {
	AttackerID string
	TargetID   string
	PowerName  string
}

// InstanceState is the full runtime state of one zone instance.
// It is pure data: the tick system reads and writes it; no behavior lives here.
type InstanceState struct {
	Units                   map[uuid.UUID]*UnitState
	Items                   map[string]instanceconfig.Item // identifier → item definition; shared across units
	PendingLootEvents       []LootEvent                    // drained each tick by the tick loop
	PendingLootClaims       []PendingLootClaim             // drained each tick; goroutines fired for each
	PendingLootFailures     []LootFailure                  // drained each tick into delta message
	PendingOwnershipUpdates []OwnershipUpdate              // drained each tick to update slot OwnedZoneItems
	PendingCombatEvents     []CombatEvent                  // drained each tick into delta message; appended by command handlers
}

// NewInstanceState constructs an InstanceState from a zone config, placing every
// unit at its starting position with full health and its resource at DefaultValue.
// Returns an error if any unit is missing its identifier, reuses an identifier
// already seen in this zone, or references an unknown unit type.
func NewInstanceState(zone instanceconfig.Zone) (*InstanceState, error) {
	state := &InstanceState{
		Units: make(map[uuid.UUID]*UnitState),
		Items: zone.Items,
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
			lootCount := [2]float64{1, 1}
			if u.LootCount != nil {
				lootCount = [2]float64{u.LootCount.Min(), u.LootCount.Max()}
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
				LootTable:           u.LootTable,
				LootCount:           lootCount,
				Status:              UnitStatusIdle,
				Target:              nil,
				ActiveStatusEffects: []ActiveStatusEffect{},
				Behavior:            BehaviorState{},
			}
		}
	}
	return state, nil
}
