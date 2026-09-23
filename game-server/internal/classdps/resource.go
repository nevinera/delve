package classdps

import (
	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// tickResourceRegen moves each of unit's resources dt*ReturnRate closer to
// its own DefaultValue - mirrors instance.tickResourceRegen's per-unit step
// (that function is unexported and tick-loop-specific, so this reimplements
// just the small "move toward DefaultValue" control flow; the actual
// Haste%/healing-taken% percentages it scales by come from the real
// command.UnitCombatStats/HealingTakenPct, not re-derived here).
func tickResourceRegen(unit *instancestate.UnitState, zone instanceconfig.Zone, dt float64) {
	var hastePct, healingTakenPct float64
	var hasteComputed, healingTakenComputed bool
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
		if r.RecoveryAffected {
			if !healingTakenComputed {
				healingTakenPct = command.HealingTakenPct(unit, zone)
				healingTakenComputed = true
			}
			rate *= 1 + healingTakenPct/100
		}
		step := rate * dt
		if r.Current < r.DefaultValue {
			r.Current = min(r.Current+step, r.DefaultValue)
		} else if r.Current > r.DefaultValue {
			r.Current = max(r.Current-step, r.DefaultValue)
		}
	}
}
