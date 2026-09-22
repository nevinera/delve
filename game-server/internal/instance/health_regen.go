package instance

import (
	"strings"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// baseHealthRegenPctPerSecond is the passive fraction of max HP a living
// player regenerates per second, always - not gated on being out of combat
// (docs/stats.md's "Passive HP Regen": the rate is deliberately small enough
// that it's a non-factor next to any actual healing, so no in/out-of-combat
// tracking is needed to gate it). Healing fully from empty takes 200s.
const baseHealthRegenPctPerSecond = 0.005

// tickHealthRegen moves every living player's Health dt*rate closer to
// MaxHealth, scaled by their own Recovery Rating like any other healing they
// receive (command.HealingTakenPct). Players only - NPCs already fully heal
// via the existing leash-return mechanic (unit_behavior.go's
// leashHealPctPerSecond) instead of needing a passive regen of their own.
func tickHealthRegen(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64) {
	for _, unit := range state.Units {
		if !strings.HasPrefix(unit.ZoneUnitIdentifier, "player:") || unit.Status == instancestate.UnitStatusDead {
			continue
		}
		if unit.Health >= unit.MaxHealth {
			continue
		}
		rate := baseHealthRegenPctPerSecond * (1 + command.HealingTakenPct(unit, zone)/100)
		unit.Health = min(unit.Health+unit.MaxHealth*rate*dt, unit.MaxHealth)
	}
}
