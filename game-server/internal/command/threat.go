package command

import (
	"strings"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

// AddThreat records amount of threat from attackerID on target's aggro
// table. Only NPCs keep one: damage to a player builds nothing.
func AddThreat(target *instancestate.UnitState, attackerID uuid.UUID, amount float64) {
	if amount <= 0 || strings.HasPrefix(target.ZoneUnitIdentifier, "player:") {
		return
	}
	if target.Behavior.Threat == nil {
		target.Behavior.Threat = make(map[uuid.UUID]float64)
	}
	target.Behavior.Threat[attackerID] += amount
}
