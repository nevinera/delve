package classdps

import (
	"math/rand"
	"time"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// tickActiveStatuses counts down every recurring StatusEffect on owner's
// active statuses by dt (mirrors instance.tickStatusEffects's per-unit
// shape - unexported and tick-loop-specific, so reimplemented here) and
// expires anything past its ExpiresAt. applier is always the simulated
// character (the only caster in this simulation), regardless of whether
// owner is the character itself (a self-buff) or the target dummy (a
// debuff/DoT) - matches RecurringTickInterval's "whoever cast this, whose
// Haste matters" semantics.
func tickActiveStatuses(owner, applier *instancestate.UnitState, zone instanceconfig.Zone, now time.Time, dt float64, addStatusTickDamage func(float64), rng *rand.Rand) {
	for i := range owner.ActiveStatusEffects {
		e := &owner.ActiveStatusEffects[i]
		for j, eff := range e.Status.Effects {
			if eff.Type != "recurring" {
				continue
			}
			e.TimeUntilNextTick[j] -= dt
			for e.TimeUntilNextTick[j] <= 0 {
				// A tick that comes due while its condition is unmet is
				// simply skipped, not deferred - mirrors
				// instance.tickStatusEffects.
				if j >= len(e.ConditionsMet) || e.ConditionsMet[j] {
					fireStatusTick(owner, applier, eff, zone, addStatusTickDamage, rng)
				}
				e.TimeUntilNextTick[j] += command.RecurringTickInterval(applier, zone, eff)
			}
		}
	}

	kept := owner.ActiveStatusEffects[:0]
	for _, e := range owner.ActiveStatusEffects {
		if now.Before(e.ExpiresAt) {
			kept = append(kept, e)
		}
	}
	owner.ActiveStatusEffects = kept
}

// refreshStatusConditions re-evaluates every StatusEffectCondition on
// owner's active statuses against this instant's state, caching the result
// in ActiveStatusEffect.ConditionsMet - mirrors
// instance.refreshStatusEffectConditions (unexported and specific to this
// package's fixed 2-unit model, so reimplemented here). target is whoever
// owner's own "current target" resolves to for the purposes of a
// targetHealthPct condition: the simulated dummy fight is a fixed 1v1, so
// Simulate's caller passes the *other* unit regardless of whether owner is
// the character (target = the dummy) or the dummy (target = the
// character) - there's no real targeting system to consult here.
func refreshStatusConditions(owner, applier, target *instancestate.UnitState) {
	for i := range owner.ActiveStatusEffects {
		e := &owner.ActiveStatusEffects[i]
		if len(e.ConditionsMet) != len(e.Status.Effects) {
			e.ConditionsMet = make([]bool, len(e.Status.Effects))
		}
		for j, eff := range e.Status.Effects {
			e.ConditionsMet[j] = command.ConditionMet(owner, applier, target, eff.Condition)
		}
	}
}

// fireStatusTick applies one recurring StatusEffect tick to owner - mirrors
// instance.fireStatusTick, minus the TaggedBy/loot bookkeeping this
// simulation has no use for. A "heal" tick isn't credited toward any
// tracked Result total (see strategy.go/power.go - healing powers simply
// aren't listed in a DPS Strategy, so a heal tick only ever fires here as a
// side effect of a damage power's own status, e.g. a self-heal woven into
// an offensive cooldown) - health/resource bookkeeping stays correct
// either way.
func fireStatusTick(owner, applier *instancestate.UnitState, eff instanceconfig.StatusEffect, zone instanceconfig.Zone, addStatusTickDamage func(float64), rng *rand.Rand) {
	switch eff.OnTick {
	case "heal":
		amount := command.StatusTickAmount(applier, zone, eff, eff.TickRate, true, rng)
		owner.Health += amount * (1 + command.HealingTakenPct(owner, zone)/100)
		if owner.Health > owner.MaxHealth {
			owner.Health = owner.MaxHealth
		}
	case "harm":
		amount := command.StatusTickAmount(applier, zone, eff, eff.TickRate, false, rng)
		dealt := command.IncomingDamage(owner, zone, amount, eff.School != "magic", rng)
		addStatusTickDamage(dealt)
		owner.Health -= dealt
		if dealt > 0 {
			applier.DamageDealtThisTick = true
			owner.DamageTakenThisTick = true
		}
		if owner.Health < 0 {
			owner.Health = 0
		}
	}
}
