package command

import (
	"math"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// UseRange is how far from an interactable's middle a player can use it,
// in feet (past their own radius): talk range plus room for the biggest
// one's half-width, since its size is the stamp's (the client's business).
const UseRange = 14.0

// UseInteractableHandler starts a player using an interactable on their
// map, within UseRange of its middle (see docs/schema/map.md#interactable):
// a cast of its use time, which moving cancels and a hit pushes back, as a
// power's does, ending in a Use (instance.tickCasts); instant when its use
// time is 0. Whether a quest wants it is the quest's business: a use no
// objective lists does nothing.
type UseInteractableHandler struct{}

func (UseInteractableHandler) Type() string      { return "use_interactable" }
func (UseInteractableHandler) Deduplicate() bool { return false }

func (UseInteractableHandler) Handle(unitID uuid.UUID, payload CommandPayload, zone instanceconfig.Zone, next *instancestate.InstanceState) error {
	p, ok := payload.(UseInteractablePayload)
	if !ok {
		return nil
	}
	unit, ok := next.Units[unitID]
	if !ok || unit.Casting != nil {
		return nil
	}
	interactable, ok := FindInteractable(zone, unit.MapIdentifier, p.Interactable)
	if !ok || !InUseRange(unit, interactable) {
		return nil
	}
	seconds := interactable.UseSeconds()
	if seconds <= 0 {
		next.PendingUses = append(next.PendingUses, instancestate.Use{UnitID: unitID, Interactable: interactable.Identifier, Map: unit.MapIdentifier})
		return nil
	}
	now := time.Now()
	unit.Casting = &instancestate.CastState{
		Interactable: &interactable,
		StartedAt:    now,
		EndsAt:       now.Add(time.Duration(seconds * float64(time.Second))),
		StartX:       unit.Position.X,
		StartY:       unit.Position.Y,
	}
	return nil
}

// FindInteractable is the interactable on map mapIdentifier with this
// identifier.
func FindInteractable(zone instanceconfig.Zone, mapIdentifier, identifier string) (instanceconfig.Interactable, bool) {
	for _, m := range zone.Maps {
		if m.Identifier != mapIdentifier {
			continue
		}
		for _, interactable := range m.Interactables {
			if interactable.Identifier == identifier {
				return interactable, true
			}
		}
	}
	return instanceconfig.Interactable{}, false
}

// InUseRange reports whether a living unit is within UseRange of an
// interactable's middle (on the unit's map; see FindInteractable).
func InUseRange(unit *instancestate.UnitState, interactable instanceconfig.Interactable) bool {
	if unit.Status == instancestate.UnitStatusDead || unit.Status == instancestate.UnitStatusRespawning {
		return false
	}
	dist := math.Hypot(interactable.Position.X-unit.Position.X, interactable.Position.Y-unit.Position.Y)
	return dist <= UseRange+unit.Radius
}
