package command

import (
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// healingTakenCeiling/healingTakenK calibrate Recovery Rating's conversion to
// a healing-taken percentage bonus - docs/stats.md's Recovery Rating section.
// Same asymptotic shape as Mastery/Defence Rating/Avoidance: a
// fully-itemized single-stat investment (445 rating, the same ceiling every
// other secondary stat uses) lands right at +100% (roughly doubling healing
// received); a small, unprioritized ("scattered") investment (~30 rating)
// lands around +15%.
const (
	healingTakenCeiling = 170.0
	healingTakenK       = 310.0
)

// HealingTakenPct returns the percentage bonus to healing unit receives from
// their own Recovery Rating - a property of the recipient, not whoever's
// casting the heal. 0 for a unit with none itemized (always 0 for an NPC,
// which carries no EquippedItems). Callers evaluate this fresh each time
// healing is applied (a HoT tick, passive regen) rather than snapshotting it
// once, so a mid-duration gear/buff change takes effect on the very next
// application - docs/stats.md is explicit that this isn't cast-time-locked.
func HealingTakenPct(unit *instancestate.UnitState, zone instanceconfig.Zone) float64 {
	_, _, _, _, stats := unitEffectiveStats(unit, zone)
	r := stats["recovery_rating"]
	if r <= 0 {
		return 0
	}
	return healingTakenCeiling * r / (r + healingTakenK)
}
