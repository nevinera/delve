package command

import "github.com/delve-mmo/game-server/internal/instancestate"

// IsEvading reports whether unit is a leashing NPC walking home: immune to
// damage, healing, resource effects, and statuses from anyone else, can't be
// tagged for loot, and can't be pulled back into combat (see
// instance/leash.go).
func IsEvading(unit *instancestate.UnitState) bool {
	return unit != nil && unit.Status == instancestate.UnitStatusLeashing
}
