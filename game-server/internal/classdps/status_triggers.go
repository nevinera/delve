package classdps

import (
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// processTriggeredEffects fires every "triggered" StatusEffect on owner
// whose trigger currently holds and whose internal cooldown has elapsed,
// accumulating any harm damage dealt via onDamage - mirrors
// instance.processTriggeredStatusEffects, reusing the same
// command.TriggerHolds/command.FireTriggeredEffect this package's real
// instancestate.UnitState/ActiveStatusEffect types already work with
// directly (unlike dpssim's own reimplementation, which has to - see its
// statuses.go's tickTriggers). ownerID identifies owner; state resolves
// affects: "target" against owner's own Target (see Simulate, where
// unit.Target/target.Target are fixed to each other for the life of the
// run - a real "current target" doesn't otherwise exist in this package).
func processTriggeredEffects(ownerID uuid.UUID, owner *instancestate.UnitState, zone instanceconfig.Zone, now time.Time, dt float64, state *instancestate.InstanceState, onDamage func(float64)) {
	for i := range owner.ActiveStatusEffects {
		if len(owner.ActiveStatusEffects[i].TriggerCooldownsRemaining) != len(owner.ActiveStatusEffects[i].Status.Effects) {
			owner.ActiveStatusEffects[i].TriggerCooldownsRemaining = make([]float64, len(owner.ActiveStatusEffects[i].Status.Effects))
		}
		// See instance.processTriggeredStatusEffects for why every access
		// below re-indexes owner.ActiveStatusEffects[i] fresh rather than
		// holding a pointer across the FireTriggeredEffect call - a
		// self-targeted "status" TriggeredEffect can grow (and reallocate)
		// this same slice.
		for j, eff := range owner.ActiveStatusEffects[i].Status.Effects {
			if eff.Type != "triggered" {
				continue
			}
			owner.ActiveStatusEffects[i].TriggerCooldownsRemaining[j] -= dt
			if owner.ActiveStatusEffects[i].TriggerCooldownsRemaining[j] > 0 {
				continue
			}
			if !command.TriggerHolds(owner, owner.DamageTakenThisTick, owner.DamageDealtThisTick, eff.Trigger) {
				continue
			}
			onDamage(command.FireTriggeredEffect(ownerID, owner, eff, zone, now, state))
			owner.ActiveStatusEffects[i].TriggerCooldownsRemaining[j] = eff.InternalCooldown
		}
	}
}
