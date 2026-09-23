package command

import (
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// MoveHandler applies MovePayload commands to a unit's facing and MovementIntent.
type MoveHandler struct{}

func (MoveHandler) Type() string      { return "move" }
func (MoveHandler) Deduplicate() bool { return true }

func (MoveHandler) Handle(unitID uuid.UUID, payload CommandPayload, zone instanceconfig.Zone, next *instancestate.InstanceState) error {
	p, ok := payload.(MovePayload)
	if !ok {
		return nil
	}
	unit, ok := next.Units[unitID]
	if !ok || unit.Status == instancestate.UnitStatusDead {
		return nil
	}
	unit.Position.Angle = p.Facing
	now := time.Now()
	if p.X != nil && p.Y != nil {
		// Client-computed position: clamp it to what's actually feasible -
		// within the unit's speed budget for the time since its last
		// accepted move, and not through a wall or circle barrier - rather
		// than trusting it outright. resolveCollisions still runs after.
		elapsed := maxFeasibilityElapsedSeconds
		if !unit.LastMoveAt.IsZero() {
			elapsed = now.Sub(unit.LastMoveAt).Seconds()
		}
		barriers := barriersForMap(zone, unit.MapIdentifier)
		prevX, prevY := unit.Position.X, unit.Position.Y
		unit.Position.X, unit.Position.Y = clampFeasibleMove(
			unit.Position.X, unit.Position.Y, *p.X, *p.Y, unit.Speed, elapsed, barriers,
		)
		unit.MovementIntent = instancestate.MovementIntent{}
		unit.LastMoveAt = now
		if unit.Position.X != prevX || unit.Position.Y != prevY {
			unit.Casting = nil // moving cancels an in-progress cast; a facing-only update does not
		}
		return nil
	}
	// Fallback (no position from client): derive movement from key intent.
	unit.LastMoveAt = now
	unit.MovementIntent = instancestate.MovementIntent{}
	for _, key := range p.Keys {
		switch key {
		case MoveKeyForward:
			unit.MovementIntent.Forward = true
		case MoveKeyBackward:
			unit.MovementIntent.Backward = true
		case MoveKeyStrafeLeft:
			unit.MovementIntent.StrafeLeft = true
		case MoveKeyStrafeRight:
			unit.MovementIntent.StrafeRight = true
		}
	}
	if len(p.Keys) > 0 {
		unit.Casting = nil // moving cancels an in-progress cast; a facing-only update does not
	}
	return nil
}
