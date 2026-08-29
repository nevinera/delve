package command

import (
	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

// StopAttackingHandler ends auto-attacking for the unit.
type StopAttackingHandler struct{}

func (StopAttackingHandler) Type() string      { return "stop_attacking" }
func (StopAttackingHandler) Deduplicate() bool { return true }

func (StopAttackingHandler) Handle(unitID uuid.UUID, payload CommandPayload, next *instancestate.InstanceState) error {
	if _, ok := payload.(StopAttackingPayload); !ok {
		return nil
	}
	unit, ok := next.Units[unitID]
	if !ok {
		return nil
	}
	unit.Attacking = false
	return nil
}
