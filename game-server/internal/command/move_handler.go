package command

import (
	"math"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// CastMoveTolerance is how far (feet) a unit can drift from where it began
// a cast before the move cancels it. Not zero: a stopped client keeps
// sending its position while it settles onto the server's (scene.js's
// reconciledTarget), in steps far smaller than any real move.
const CastMoveTolerance = 0.5

func cancelCastIfMoved(unit *instancestate.UnitState) {
	cast := unit.Casting
	if cast != nil && math.Hypot(unit.Position.X-cast.StartX, unit.Position.Y-cast.StartY) > CastMoveTolerance {
		unit.Casting = nil
	}
}

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
			cancelCastIfMoved(unit) // a facing-only update doesn't
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
