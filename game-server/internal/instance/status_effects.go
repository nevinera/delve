package instance

import (
	"math/rand"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// tickStatusEffects counts down every recurring StatusEffect on every
// unit's active statuses by dt. Haste doesn't shorten a status's duration -
// only how often it ticks - and the interval-to-next-tick is decided once
// each time a tick is scheduled (recomputed from the applier's Haste right
// then, via command.RecurringTickInterval), not continuously re-evaluated
// between ticks: a Haste change takes effect starting with whichever tick
// fires next, not retroactively on the one already counting down. A single
// server tick can fire more than one status tick if the interval is short
// enough to fit (the inner for loop catches up), and a tick still fires
// even if the status will expire later this same server tick - expiry is
// handled separately, after this.
func tickStatusEffects(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64, rng *rand.Rand) {
	for targetID, unit := range state.Units {
		for i := range unit.ActiveStatusEffects {
			e := &unit.ActiveStatusEffects[i]
			applier := state.Units[e.ApplierID]
			for j, eff := range e.Status.Effects {
				if eff.Type != "recurring" {
					continue
				}
				e.TimeUntilNextTick[j] -= dt
				for e.TimeUntilNextTick[j] <= 0 {
					// A tick that comes due while its condition is unmet is
					// simply skipped, not deferred - the cadence below keeps
					// counting regardless (see docs/schema/status.md).
					if j >= len(e.ConditionsMet) || e.ConditionsMet[j] {
						fireStatusTick(targetID, unit, applier, e.ApplierID, zone, eff, state, rng)
					}
					e.TimeUntilNextTick[j] += command.RecurringTickInterval(applier, zone, eff)
					if unit.Status == instancestate.UnitStatusDead {
						break
					}
				}
			}
			if unit.Status == instancestate.UnitStatusDead {
				break
			}
		}
	}
}

// fireStatusTick applies one recurring StatusEffect tick from applier (nil
// if they've left the instance since applying it, e.g. logged out - the
// tick is skipped rather than guessing at a stat-scaled amount) to target.
func fireStatusTick(targetID uuid.UUID, target, applier *instancestate.UnitState, applierID uuid.UUID, zone instanceconfig.Zone, eff instanceconfig.StatusEffect, state *instancestate.InstanceState, rng *rand.Rand) {
	if applier == nil {
		return
	}
	switch eff.OnTick {
	case "heal":
		amount := command.StatusTickAmount(applier, zone, eff, eff.TickRate, true, rng)
		target.Health += amount * (1 + command.HealingTakenPct(target, zone)/100)
		if target.Health > target.MaxHealth {
			target.Health = target.MaxHealth
		}
	case "harm":
		if target.TaggedBy == nil && target.Hostility != "" {
			id := applierID
			target.TaggedBy = &id
		}
		amount := command.StatusTickAmount(applier, zone, eff, eff.TickRate, false, rng)
		dealt := command.IncomingDamage(target, zone, amount, eff.School != "magic", rng)
		target.Health -= dealt
		if dealt > 0 {
			applier.DamageDealtThisTick = true
			target.DamageTakenThisTick = true
		}
		if target.Health < 0 {
			target.Health = 0
		}
		if target.Health == 0 {
			target.Status = instancestate.UnitStatusDead
			target.Target = nil
			instancestate.RollAndRecordLoot(targetID, target, state, rng)
		}
	}
}

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
