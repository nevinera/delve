package instance

import (
	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// updateCombatStats recomputes every unit's CombatStats. It runs at the top
// of the tick, after status conditions refresh and before anything mutates
// gear, statuses or resources, so every calculation in the tick reads one
// consistent snapshot and the order of execution within the tick doesn't
// matter.
func updateCombatStats(state *instancestate.InstanceState, zone instanceconfig.Zone) {
	for _, unit := range state.Units {
		unit.CombatStats = command.ComputeCombatStats(unit, zone)
	}
}
