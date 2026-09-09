package instance

import (
	"strings"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// updatePlayerMaxHealth recomputes every player unit's MaxHealth from their
// currently equipped Stamina (command.PlayerMaxHealth - see docs/stats.md's
// "Stamina" section). This needs to run every tick, not just on equip
// changes: Stamina is elvl-scaled like every other gear-derived stat, so a
// player crossing between maps of different elevation changes it too.
// Called early in the tick (after commands, which include equipping) so
// everything downstream that reads MaxHealth this tick - leash regen,
// status-tick heal clamping, damage clamping - sees the current value.
//
// Current Health only clamps down if it now exceeds the new cap -
// equipping/losing Stamina doesn't auto-heal or auto-damage past that,
// same convention already used for heal/status-tick clamping elsewhere.
func updatePlayerMaxHealth(state *instancestate.InstanceState, zone instanceconfig.Zone) {
	for _, unit := range state.Units {
		if !strings.HasPrefix(unit.ZoneUnitIdentifier, "player:") {
			continue
		}
		unit.MaxHealth = command.PlayerMaxHealth(unit, zone)
		if unit.Health > unit.MaxHealth {
			unit.Health = unit.MaxHealth
		}
	}
}
