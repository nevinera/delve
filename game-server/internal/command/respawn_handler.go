package command

import (
	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

// RespawnHandler resets a dead player to their spawn point with full health.
type RespawnHandler struct{}

func (RespawnHandler) Type() string      { return "respawn" }
func (RespawnHandler) Deduplicate() bool { return true }

func (RespawnHandler) Handle(unitID uuid.UUID, _ CommandPayload, next *instancestate.InstanceState) error {
	unit, ok := next.Units[unitID]
	if !ok || unit.Status != instancestate.UnitStatusDead {
		return nil
	}
	unit.Health = unit.MaxHealth
	unit.MapIdentifier = unit.SpawnMapIdentifier
	unit.Position = unit.SpawnPoint
	unit.Target = nil
	unit.Status = instancestate.UnitStatusIdle
	return nil
}
