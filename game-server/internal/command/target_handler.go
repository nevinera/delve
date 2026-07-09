package command

import (
	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

// TargetHandler applies TargetPayload commands, setting or clearing a player's target.
type TargetHandler struct{}

func (TargetHandler) Type() string      { return "target" }
func (TargetHandler) Deduplicate() bool { return true }

func (TargetHandler) Handle(unitID uuid.UUID, payload CommandPayload, next *instancestate.InstanceState) error {
	p, ok := payload.(TargetPayload)
	if !ok {
		return nil
	}
	unit, ok := next.Units[unitID]
	if !ok {
		return nil
	}
	unit.Target = p.TargetID
	return nil
}
