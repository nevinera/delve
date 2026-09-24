package dpssim

import (
	"math"
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

// triggerCooldown tracks one "triggered" StatusEffect's next-fire-allowed
// time within an activeStatus - parallel to
// instancestate.ActiveStatusEffect's TriggerCooldownsRemaining, but as an
// absolute simulated-time instead of a countdown.
type triggerCooldown struct {
	effect    instanceconfig.StatusEffect
	nextReady float64
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
	triggers  []triggerCooldown
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

// newTriggers seeds a fresh triggerCooldown for every "triggered"
// StatusEffect in status, ready immediately (nextReady == now) - mirrors
// command.ApplyStatus seeding TriggerCooldownsRemaining at 0.
func newTriggers(status instanceconfig.Status, now float64) []triggerCooldown {
	var triggers []triggerCooldown
	for _, eff := range status.Effects {
		if eff.Type != "triggered" {
			continue
		}
		triggers = append(triggers, triggerCooldown{effect: eff, nextReady: now})
	}
	return triggers
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
			e.triggers = newTriggers(status, now)
		case "stack":
			e.stacks++
			if status.MaxStacks > 0 && e.stacks > status.MaxStacks {
				e.stacks = status.MaxStacks
			}
		}
		// "extend" (and "stack"'s tick cadence/triggers) leaves ticks and
		// triggers undisturbed - only expiresAt (and, for "stack", the
		// stack count) moves.
		return statuses
	}

	return append(statuses, &activeStatus{
		status:    status,
		expiresAt: expiresAt,
		stacks:    1,
		ticks:     newTicks(status, now),
		triggers:  newTriggers(status, now),
	})
}

// tickStatuses mirrors status_effects.go's tickStatusEffects/fireStatusTick,
// restricted to onTick: "harm" (the only kind that contributes to enemy
// DPS - onTick: "heal" ticks don't damage the target and are skipped).
// Firing at exactly now, then rescheduling, mirrors the real per-tick
// countdown-and-refire loop without needing a discrete tick rate of our own.
//
// resource/resourceName back a casterResource StatusEffectCondition (see
// conditionMet) - this package tracks only the one enemy resource
// UnitType.Resource describes, matching Simulate's own `resource float64`
// local.
func tickStatuses(statuses []*activeStatus, now float64, target TargetStats, resource float64, resourceName string, rng *rand.Rand, onDamage func(float64)) {
	for _, e := range statuses {
		for i := range e.ticks {
			t := &e.ticks[i]
			for t.nextTick <= now {
				// A tick that comes due while its condition is unmet is
				// simply skipped, not deferred - mirrors
				// instance.tickStatusEffects.
				if t.effect.OnTick == "harm" && conditionMet(t.effect.Condition, statuses, resource, resourceName) {
					dmg := statusTickDamage(t.effect, rng)
					onDamage(incomingDamage(target, dmg, t.effect.School != "magic", rng))
				}
				t.nextTick += t.effect.TickRate
			}
		}
	}
}

// conditionMet evaluates a StatusEffectCondition against what this package
// actually tracks - only hasStatus and casterResource are modelable here:
// unlike command.ConditionMet's full instancestate.UnitState, this
// package's Simulate never tracks a live HP for either the target dummy
// (TargetStats is a static resolved-stats profile, not a mutable unit -
// see target.go) or the enemy itself (Simulate only measures the enemy's
// damage OUTPUT; it never models the enemy taking damage back - see
// package doc). selfHealthPct/targetHealthPct therefore always evaluate
// false here, the same deliberate staleness this package already
// documents for StatusEffect{Type: "stat"} - not a bug, just something an
// HP-gated conditional effect can't be exercised through unit-dps-sim
// until/unless this package's scope grows to model that.
func conditionMet(cond *instanceconfig.StatusEffectCondition, statuses []*activeStatus, resource float64, resourceName string) bool {
	if cond == nil {
		return true
	}
	switch cond.Type {
	case "hasStatus":
		for _, e := range statuses {
			if e.status.Name == cond.StatusName {
				return true
			}
		}
		return false
	case "casterResource":
		if cond.ResourceName != resourceName {
			return false
		}
		return compareThreshold(resource, cond)
	default:
		return false
	}
}

func compareThreshold(value float64, cond *instanceconfig.StatusEffectCondition) bool {
	switch cond.Comparison {
	case "above":
		return value > cond.Threshold
	case "below":
		return value < cond.Threshold
	default:
		return false
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

// triggeredEffectDamage mirrors harmEffectDamage, rolling a "triggered"
// StatusEffect's harm amount (TriggeredEffect.Amount, not PowerEffect's -
// same shape, different field) the same way: a miss (5% base chance)
// returns 0, otherwise the authored range times the roll's crit multiplier.
// No stat-DPS-bonus term, same as harmEffectDamage/statusTickDamage - NPCs
// carry no itemized stats to scale from (see package doc).
func triggeredEffectDamage(eff instanceconfig.StatusEffect, rng *rand.Rand) float64 {
	missed, multiplier := rollOutcome(rng)
	if missed {
		return 0
	}
	lo, hi := eff.TriggeredEffect.Amount.Min(), eff.TriggeredEffect.Amount.Max()
	rolled := lo + rng.Float64()*(hi-lo)
	return math.Round(rolled * multiplier)
}

// tickTriggers fires any "triggered" StatusEffect within statuses whose
// trigger currently holds and whose internal cooldown has elapsed, and
// returns the (possibly grown, by a "status" effect) statuses slice.
// Simulate's loop is event-driven, not fixed-tick (see package doc) -
// exactly one action (a basic attack, a power, or the single nearest DoT
// tick) resolves per iteration, so this is called once per iteration, right
// after whichever action ran.
//
// Only trigger.type == "dealsDamage" is modelable here - see doc.go's
// known-gaps list for why healthAbove/healthBelow/takesDamage can't be.
// dealtDamageThisStep is the caller's "did this iteration's action land a
// hit" signal.
//
// Effect support is also narrower than the real engine's
// command.FireTriggeredEffect: harm/status apply against the shared
// statuses/target - there's no real distinction here between "the enemy's
// own buffs" and "debuffs on the target" (see applyPowerEffects, which
// already conflates them the same way) - resource only honors
// affects: "self" (no target resource exists to adjust), and heal is a
// no-op (no live HP anywhere for either side to heal - see package doc).
func tickTriggers(statuses []*activeStatus, now float64, target TargetStats, dealtDamageThisStep bool, resource *float64, maxResource float64, rng *rand.Rand, onDamage func(float64)) []*activeStatus {
	if !dealtDamageThisStep {
		return statuses
	}
	for _, e := range statuses {
		for i := range e.triggers {
			tr := &e.triggers[i]
			if tr.nextReady > now {
				continue
			}
			if tr.effect.Trigger == nil || tr.effect.Trigger.Type != "dealsDamage" {
				continue
			}
			statuses = fireTrigger(statuses, tr.effect, target, resource, maxResource, now, rng, onDamage)
			tr.nextReady = now + tr.effect.InternalCooldown
		}
	}
	return statuses
}

func fireTrigger(statuses []*activeStatus, eff instanceconfig.StatusEffect, target TargetStats, resource *float64, maxResource, now float64, rng *rand.Rand, onDamage func(float64)) []*activeStatus {
	te := eff.TriggeredEffect
	switch te.Type {
	case "harm":
		if te.Amount == nil {
			return statuses
		}
		onDamage(incomingDamage(target, triggeredEffectDamage(eff, rng), te.School != "magic", rng))
	case "status":
		if te.Status == nil {
			return statuses
		}
		return applyStatus(statuses, *te.Status, te.Duration, now)
	case "resource":
		if te.Affects == "self" {
			*resource = clampResource(*resource+te.Delta, maxResource)
		}
	}
	return statuses
}
