package command_test

import (
	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// stampStats gives every unit in state the tick-start CombatStats snapshot
// the instance tick would have computed, for tests that call handlers
// directly instead of running a tick.
func stampStats(state *instancestate.InstanceState, zone instanceconfig.Zone, extra ...*instancestate.UnitState) {
	for _, u := range extra {
		u.CombatStats = command.ComputeCombatStats(u, zone)
	}
	for _, u := range state.Units {
		u.CombatStats = command.ComputeCombatStats(u, zone)
	}
}
