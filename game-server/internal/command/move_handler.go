package command

import (
	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

// MoveHandler applies MovePayload commands to a unit's facing and MovementIntent.
type MoveHandler struct{}

func (MoveHandler) Type() string      { return "move" }
func (MoveHandler) Deduplicate() bool { return true }

func (MoveHandler) Handle(unitID uuid.UUID, payload CommandPayload, next *instancestate.InstanceState) error {
	p, ok := payload.(MovePayload)
	if !ok {
		return nil
	}
	unit, ok := next.Units[unitID]
	if !ok || unit.Status == instancestate.UnitStatusDead {
		return nil
	}
	unit.Position.Angle = p.Facing
	if p.X != nil && p.Y != nil {
		// Client-computed position: accept it directly and clear intent so
		// applyMovement skips this unit. resolveCollisions still runs after.
		unit.Position.X = *p.X
		unit.Position.Y = *p.Y
		unit.MovementIntent = instancestate.MovementIntent{}
		return nil
	}
	// Fallback (no position from client): derive movement from key intent.
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
	return nil
}
