package dpssim

import (
	"math/rand"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// recurringTick tracks one "recurring" StatusEffect's next-fire time within
// an activeStatus - parallel to instancestate.ActiveStatusEffect's
// TimeUntilNextTick, but as an absolute simulated-time instead of a
// countdown.
type recurringTick struct {
	effect   instanceconfig.StatusEffect
	nextTick float64
}

// activeStatus is this simulation's analog of instancestate.ActiveStatusEffect.
// There's always exactly one applier (the enemy being simulated) and one
// target (the dummy), so ApplyStatus's ApplierID matching collapses to
// matching on Status.Name alone.
type activeStatus struct {
	status    instanceconfig.Status
	expiresAt float64
	stacks    int
	ticks     []recurringTick
}

// newTicks seeds a fresh recurringTick for every "recurring" StatusEffect
// in status, first firing one full TickRate after now - mirrors
// initialTickTimers, simplified by the same always-0-Haste fact as the rest
// of this package (RecurringTickInterval collapses to the effect's own
// unhasted TickRate for an NPC applier).
func newTicks(status instanceconfig.Status, now float64) []recurringTick {
	var ticks []recurringTick
	for _, eff := range status.Effects {
		if eff.Type != "recurring" || eff.TickRate <= 0 {
			continue
		}
		ticks = append(ticks, recurringTick{effect: eff, nextTick: now + eff.TickRate})
	}
	return ticks
}

// applyStatus mirrors command.ApplyStatus: refreshes an existing
// same-Name active status per its Stacking rule, or starts a new one.
func applyStatus(statuses []*activeStatus, status instanceconfig.Status, duration float64, now float64) []*activeStatus {
	expiresAt := now + duration
	for _, e := range statuses {
		if e.status.Name != status.Name {
			continue
		}
		e.status = status
		e.expiresAt = expiresAt
		switch status.Stacking {
		case "replace":
			e.stacks = 1
			e.ticks = newTicks(status, now)
		case "stack":
			e.stacks++
			if status.MaxStacks > 0 && e.stacks > status.MaxStacks {
				e.stacks = status.MaxStacks
			}
		}
		// "extend" (and "stack"'s tick cadence) leaves ticks undisturbed -
		// only expiresAt (and, for "stack", the stack count) moves.
		return statuses
	}

	return append(statuses, &activeStatus{
		status:    status,
		expiresAt: expiresAt,
		stacks:    1,
		ticks:     newTicks(status, now),
	})
}

// tickStatuses mirrors status_effects.go's tickStatusEffects/fireStatusTick,
// restricted to onTick: "harm" (the only kind that contributes to enemy
// DPS - onTick: "heal" ticks don't damage the target and are skipped).
// Firing at exactly now, then rescheduling, mirrors the real per-tick
// countdown-and-refire loop without needing a discrete tick rate of our own.
func tickStatuses(statuses []*activeStatus, now float64, target TargetStats, rng *rand.Rand, onDamage func(float64)) {
	for _, e := range statuses {
		for i := range e.ticks {
			t := &e.ticks[i]
			for t.nextTick <= now {
				if t.effect.OnTick == "harm" {
					dmg := statusTickDamage(t.effect, rng)
					onDamage(incomingDamage(target, dmg, t.effect.School != "magic", rng))
				}
				t.nextTick += t.effect.TickRate
			}
		}
	}
}

// expireStatuses drops any activeStatus whose expiresAt has passed.
func expireStatuses(statuses []*activeStatus, now float64) []*activeStatus {
	kept := statuses[:0]
	for _, e := range statuses {
		if e.expiresAt > now {
			kept = append(kept, e)
		}
	}
	return kept
}
