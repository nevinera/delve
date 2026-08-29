package command

import (
	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

// StartAttackingHandler begins auto-attacking the unit's current target.
// No-op if the unit has no target.
type StartAttackingHandler struct{}

func (StartAttackingHandler) Type() string      { return "start_attacking" }
func (StartAttackingHandler) Deduplicate() bool { return true }

func (StartAttackingHandler) Handle(unitID uuid.UUID, payload CommandPayload, next *instancestate.InstanceState) error {
	if _, ok := payload.(StartAttackingPayload); !ok {
		return nil
	}
	unit, ok := next.Units[unitID]
	if !ok {
		return nil
	}
	if unit.Target == nil {
		return nil
	}
	unit.Attacking = true
	return nil
}
