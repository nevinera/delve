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
	if !ok {
		return nil
	}
	unit.Position.Angle = p.Facing
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
