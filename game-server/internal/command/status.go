package command

import (
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// ApplyStatus applies status (sourced from applierID, e.g. a power's
// "status" effect) to target, honoring its stacking rule against any
// existing application from the SAME applier - different appliers' copies
// of the same-named status are tracked independently (see
// docs/schema/status.md). duration is the applying effect's own duration
// (PowerEffect.Duration for a power's status effect) - not part of Status
// itself. now is the current tick's timestamp.
func ApplyStatus(target *instancestate.UnitState, applierID uuid.UUID, status instanceconfig.Status, duration float64, now time.Time) {
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
			e.TimeUntilNextTick = initialTickTimers(status)
		case "stack":
			e.Stacks++
			if status.MaxStacks > 0 && e.Stacks > status.MaxStacks {
				e.Stacks = status.MaxStacks
			}
		}
		// "extend" (and "stack"'s tick cadence) leaves TimeUntilNextTick
		// undisturbed - only the shared ExpiresAt (and, for "stack", the
		// stack count) moves.
		return
	}

	target.ActiveStatusEffects = append(target.ActiveStatusEffects, instancestate.ActiveStatusEffect{
		Status:            status,
		ApplierID:         applierID,
		ExpiresAt:         expiresAt,
		Stacks:            1,
		TimeUntilNextTick: initialTickTimers(status),
	})
}

// initialTickTimers seeds TimeUntilNextTick for a freshly (re)applied
// status: each "recurring" effect starts counting down from its own base
// tickRate - haste-scaled live scheduling is applied per-tick, not here
// (see docs/stats.md's Haste and tmp/plan.md).
func initialTickTimers(status instanceconfig.Status) []float64 {
	timers := make([]float64, len(status.Effects))
	for i, effect := range status.Effects {
		if effect.Type == "recurring" {
			timers[i] = effect.TickRate
		}
	}
	return timers
}
