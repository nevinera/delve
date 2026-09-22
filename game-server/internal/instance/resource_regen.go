package instance

import (
	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// tickResourceRegen moves every living unit's Resource dt*ResourceReturnRate
// closer to ResourceDefaultValue - the same passive-return behavior for
// every unit, whether that means regenerating up (mana/energy, DefaultValue
// == Max) or decaying down (a rage-like resource, DefaultValue == 0). A
// unit with no resource has ResourceReturnRate == 0, so this is a no-op for
// it. Dead units don't regen - a corpse's resource doesn't matter, and this
// avoids a live unit's spend/regen ever timing against one currently
// resolving death effects.
//
// When ResourceHasteAffected is set (docs/schema/resource_type.md), the
// step is additionally scaled by the unit's Haste% - the same
// DamageStatKey-keyed physical/magic pool command.UnitCombatStats uses for
// basic attacks (only meaningful for players; NPCs have no gear/Haste, so
// this is a no-op for them regardless of the flag).
func tickResourceRegen(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64) {
	for _, unit := range state.Units {
		if unit.Status == instancestate.UnitStatusDead || unit.ResourceReturnRate == 0 {
			continue
		}
		rate := unit.ResourceReturnRate
		if unit.ResourceHasteAffected {
			hastePct, _, _ := command.UnitCombatStats(unit, zone)
			rate *= 1 + hastePct/100
		}
		step := rate * dt
		if unit.Resource < unit.ResourceDefaultValue {
			unit.Resource = min(unit.Resource+step, unit.ResourceDefaultValue)
		} else if unit.Resource > unit.ResourceDefaultValue {
			unit.Resource = max(unit.Resource-step, unit.ResourceDefaultValue)
		}
	}
}
