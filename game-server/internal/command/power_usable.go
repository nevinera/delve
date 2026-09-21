package command

import (
	"time"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// PowerUsable reports whether unit could cast power right now: off the
// global cooldown, off power's own per-power cooldown (if any), and able to
// afford its cost (if any). It doesn't check range/facing/target
// availability - callers still do that themselves, since it varies by
// caller (a player's cast just fails outright when out of range;
// tryNPCAttack's power-selection loop skips that power for a different one
// instead).
func PowerUsable(unit *instancestate.UnitState, power instanceconfig.Power, now time.Time) bool {
	if now.Before(unit.GlobalCooldownEndsAt) {
		return false
	}
	if power.Cooldown > 0 {
		if cd, ok := unit.PowerCooldowns[power.Name]; ok && now.Before(cd) {
			return false
		}
	}
	if power.CostAmount > 0 && unit.Resource < power.CostAmount {
		return false
	}
	return true
}

// ClampResource bounds a resource value to [0, max].
func ClampResource(value, max float64) float64 {
	if value < 0 {
		return 0
	}
	if value > max {
		return max
	}
	return value
}
