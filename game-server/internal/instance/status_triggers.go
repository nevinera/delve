package instance

import (
	"time"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// processTriggeredStatusEffects fires every "triggered" StatusEffect
// (docs/schema/status.md#triggered) whose trigger currently holds and whose
// internal cooldown has elapsed, then clears every unit's
// DamageTakenThisTick/DamageDealtThisTick for the next tick. Runs once per
// tick, after tickStatusEffects (so a recurring DoT tick earlier this same
// tick still counts toward takesDamage/dealsDamage) and before
// expireStatusEffects (so a status expiring this same tick still gets one
// last chance to fire).
func processTriggeredStatusEffects(state *instancestate.InstanceState, zone instanceconfig.Zone, now time.Time, dt float64) {
	for unitID, unit := range state.Units {
		for i := range unit.ActiveStatusEffects {
			if len(unit.ActiveStatusEffects[i].TriggerCooldownsRemaining) != len(unit.ActiveStatusEffects[i].Status.Effects) {
				unit.ActiveStatusEffects[i].TriggerCooldownsRemaining = make([]float64, len(unit.ActiveStatusEffects[i].Status.Effects))
			}
			// A self-targeted "status" TriggeredEffect can grow (and
			// reallocate) this same unit.ActiveStatusEffects slice via
			// FireTriggeredEffect -> command.ApplyStatus - so every access
			// below re-indexes unit.ActiveStatusEffects[i] fresh rather
			// than holding a *ActiveStatusEffect pointer across that call,
			// which could otherwise go stale mid-loop (i itself stays
			// valid: appending only adds past the end).
			for j, eff := range unit.ActiveStatusEffects[i].Status.Effects {
				if eff.Type != "triggered" {
					continue
				}
				unit.ActiveStatusEffects[i].TriggerCooldownsRemaining[j] -= dt
				if unit.ActiveStatusEffects[i].TriggerCooldownsRemaining[j] > 0 {
					continue
				}
				if !command.TriggerHolds(unit, unit.DamageTakenThisTick, unit.DamageDealtThisTick, eff.Trigger) {
					continue
				}
				command.FireTriggeredEffect(unitID, unit, eff, zone, now, state)
				unit.ActiveStatusEffects[i].TriggerCooldownsRemaining[j] = eff.InternalCooldown
			}
		}
	}

	for _, unit := range state.Units {
		unit.DamageTakenThisTick = false
		unit.DamageDealtThisTick = false
	}
}
