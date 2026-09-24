package command

import (
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// ApplyStatus applies status (cast by applier/applierID, e.g. a power's
// "status" effect) to target, honoring its stacking rule against any
// existing application from the SAME applier - different appliers' copies
// of the same-named status are tracked independently (see
// docs/schema/status.md). duration is the applying effect's own duration
// (PowerEffect.Duration for a power's status effect) - not part of Status
// itself. now is the current tick's timestamp.
//
// applier/zone are needed to compute the applier's current Haste, which
// scales the interval to a recurring effect's first tick just as much as
// every later one - applying a status is itself the first "scheduling"
// event, not an unhasted special case (see RecurringTickInterval).
func ApplyStatus(target, applier *instancestate.UnitState, applierID uuid.UUID, status instanceconfig.Status, duration float64, zone instanceconfig.Zone, now time.Time) {
	expiresAt := now.Add(time.Duration(duration * float64(time.Second)))

	for i := range target.ActiveStatusEffects {
		e := &target.ActiveStatusEffects[i]
		if e.Status.Name != status.Name || e.ApplierID != applierID {
			continue
		}
		e.Status = status
		e.ExpiresAt = expiresAt
		switch status.Stacking {
		case "replace":
			e.Stacks = 1
			e.TimeUntilNextTick = initialTickTimers(applier, zone, status)
			e.ConditionsMet = initialConditionsMet(status)
			e.TriggerCooldownsRemaining = make([]float64, len(status.Effects))
		case "stack":
			e.Stacks++
			if status.MaxStacks > 0 && e.Stacks > status.MaxStacks {
				e.Stacks = status.MaxStacks
			}
		}
		// "extend" (and "stack"'s tick cadence/conditions/cooldowns) leaves
		// TimeUntilNextTick, ConditionsMet, and TriggerCooldownsRemaining
		// undisturbed - only the shared ExpiresAt (and, for "stack", the
		// stack count) moves.
		return
	}

	target.ActiveStatusEffects = append(target.ActiveStatusEffects, instancestate.ActiveStatusEffect{
		Status:                    status,
		ApplierID:                 applierID,
		ExpiresAt:                 expiresAt,
		Stacks:                    1,
		TimeUntilNextTick:         initialTickTimers(applier, zone, status),
		ConditionsMet:             initialConditionsMet(status),
		TriggerCooldownsRemaining: make([]float64, len(status.Effects)),
	})
}

// initialConditionsMet seeds ConditionsMet for a freshly (re)applied status:
// true for an effect with no Condition (so ordinary, unconditional
// stat/recurring effects - the vast majority of existing content - work
// immediately, with no gap), false for a conditional one, until the next
// per-tick refresh evaluates it for real (see command.ConditionMet and
// instance/status_conditions.go) - applying a status doesn't itself have
// access to the full instance state a condition like targetHealthPct needs.
func initialConditionsMet(status instanceconfig.Status) []bool {
	met := make([]bool, len(status.Effects))
	for i, effect := range status.Effects {
		met[i] = effect.Condition == nil
	}
	return met
}

// initialTickTimers seeds TimeUntilNextTick for a freshly (re)applied
// status: each "recurring" effect starts counting down from an interval
// computed from the applier's Haste right now (see RecurringTickInterval) -
// same as every later reschedule, just evaluated at application instead of
// at a tick firing.
func initialTickTimers(applier *instancestate.UnitState, zone instanceconfig.Zone, status instanceconfig.Status) []float64 {
	timers := make([]float64, len(status.Effects))
	for i, effect := range status.Effects {
		if effect.Type == "recurring" {
			timers[i] = RecurringTickInterval(applier, zone, effect)
		}
	}
	return timers
}
