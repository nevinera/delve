package instance

import (
	"time"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

// expireStatusEffects removes any ActiveStatusEffect whose ExpiresAt has
// passed, on every unit. All stacks of a "stack"-stacking status share one
// timer (docs/schema/status.md), so an expiry always removes the whole
// entry, never decrements it.
func expireStatusEffects(state *instancestate.InstanceState, now time.Time) {
	for _, unit := range state.Units {
		if len(unit.ActiveStatusEffects) == 0 {
			continue
		}
		kept := unit.ActiveStatusEffects[:0]
		for _, e := range unit.ActiveStatusEffects {
			if now.Before(e.ExpiresAt) {
				kept = append(kept, e)
			}
		}
		unit.ActiveStatusEffects = kept
	}
}
