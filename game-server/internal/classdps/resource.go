package classdps

import (
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// tickResourceRegen moves each of unit's resources dt*ReturnRate closer to
// its own DefaultValue - mirrors instance.tickResourceRegen's per-unit step
// (that function is unexported and tick-loop-specific, so this reimplements
// just the small "move toward DefaultValue" control flow). hastePct and
// healingTakenPct are precomputed by the caller (see simulate.go's
// resourceStatsRecalcInterval) rather than recomputed here every call -
// they come from the real command.UnitCombatStats/HealingTakenPct, just not
// re-derived at this function's own tick granularity.
func tickResourceRegen(unit *instancestate.UnitState, hastePct, healingTakenPct, dt float64) {
	for _, r := range unit.Resources {
		if r.ReturnRate == 0 {
			continue
		}
		rate := r.ReturnRate
		if r.HasteAffected {
			rate *= 1 + hastePct/100
		}
		if r.RecoveryAffected {
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

// resourceRegenNeedsStats reports whether any of resources actually regens
// in a way that depends on Haste%/healing-taken% - so Simulate can skip the
// (real, itemstats-backed) command calls that derive them entirely for a
// class with neither, rather than just recomputing them less often.
func resourceRegenNeedsStats(resources []instanceconfig.ResourceType) (needsHaste, needsHealingTaken bool) {
	for _, r := range resources {
		if r.ReturnRate == 0 {
			continue
		}
		needsHaste = needsHaste || r.HasteAffected
		needsHealingTaken = needsHealingTaken || r.RecoveryAffected
	}
	return needsHaste, needsHealingTaken
}
