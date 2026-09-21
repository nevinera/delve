package instance

import (
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
func tickResourceRegen(state *instancestate.InstanceState, dt float64) {
	for _, unit := range state.Units {
		if unit.Status == instancestate.UnitStatusDead || unit.ResourceReturnRate == 0 {
			continue
		}
		step := unit.ResourceReturnRate * dt
		if unit.Resource < unit.ResourceDefaultValue {
			unit.Resource = min(unit.Resource+step, unit.ResourceDefaultValue)
		} else if unit.Resource > unit.ResourceDefaultValue {
			unit.Resource = max(unit.Resource-step, unit.ResourceDefaultValue)
		}
	}
}
