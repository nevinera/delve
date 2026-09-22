package instance

import (
	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// tickResourceRegen moves every one of every living unit's resources
// dt*ReturnRate closer to its own DefaultValue - the same passive-return
// behavior for every resource a unit has, whether that means regenerating up
// (mana/energy, DefaultValue == Max) or decaying down (a rage-like resource,
// DefaultValue == 0), and a no-op for a ReturnRate == 0 resource (e.g. a
// discrete one like combo points that only ever changes via a power's
// "resource" effect). Dead units don't regen - a corpse's resources don't
// matter, and this avoids a live unit's spend/regen ever timing against one
// currently resolving death effects.
//
// When a resource's HasteAffected is set (docs/schema/resource_type.md), its
// step is additionally scaled by the unit's Haste% - the same
// DamageStatKey-keyed physical/magic pool command.UnitCombatStats uses for
// basic attacks (only meaningful for players; NPCs have no gear/Haste, so
// this is a no-op for them regardless of the flag).
func tickResourceRegen(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64) {
	for _, unit := range state.Units {
		if unit.Status == instancestate.UnitStatusDead {
			continue
		}
		var hastePct float64
		hasteComputed := false
		for _, r := range unit.Resources {
			if r.ReturnRate == 0 {
				continue
			}
			rate := r.ReturnRate
			if r.HasteAffected {
				if !hasteComputed {
					hastePct, _, _ = command.UnitCombatStats(unit, zone)
					hasteComputed = true
				}
				rate *= 1 + hastePct/100
			}
			step := rate * dt
			if r.Current < r.DefaultValue {
				r.Current = min(r.Current+step, r.DefaultValue)
			} else if r.Current > r.DefaultValue {
				r.Current = max(r.Current-step, r.DefaultValue)
			}
		}
	}
}
