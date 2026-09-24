package command

import (
	"math/rand"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// TriggerHolds reports whether a StatusTrigger currently holds for the unit
// holding it. holder is that unit; damageTaken/damageDealt are whether
// holder took/dealt any damage this tick (see UnitState.DamageTakenThisTick/
// DamageDealtThisTick) - callers resolve those however fits their own data
// model, same division of labor as ConditionMet.
func TriggerHolds(holder *instancestate.UnitState, damageTaken, damageDealt bool, trigger *instanceconfig.StatusTrigger) bool {
	if holder == nil || trigger == nil {
		return false
	}
	switch trigger.Type {
	case "healthAbove":
		return healthPct(holder) > trigger.Threshold
	case "healthBelow":
		return healthPct(holder) < trigger.Threshold
	case "takesDamage":
		return damageTaken
	case "dealsDamage":
		return damageDealt
	default:
		return false
	}
}

// TriggeredEffectAmount rolls a "triggered" StatusEffect's harm/heal amount -
// the same stat-scaling/crit/miss math as PowerEffectAmount/StatusTickAmount,
// using the containing StatusEffect's own InternalCooldown as the timeBudget
// (the closest analog this has to a power's GCD or a recurring effect's
// TickRate - "roughly how often does this fire").
func TriggeredEffectAmount(unit *instancestate.UnitState, zone instanceconfig.Zone, eff instanceconfig.StatusEffect, isHeal bool) float64 {
	te := eff.TriggeredEffect
	lo, hi := te.Amount.Min(), te.Amount.Max()
	rolled := lo + rand.Float64()*(hi-lo)
	return effectAmount(unit, zone, te.School, rolled, eff.InternalCooldown, isHeal, false)
}

// FireTriggeredEffect applies a "triggered" StatusEffect's payload from
// holder (the unit the status is active on), returning the harm damage
// dealt (0 for every other effect type, or if it didn't fire) - purely for
// a caller that wants to tally it (e.g. classdps's Result.TriggeredDamage);
// the real engine's own call site ignores it, since a unit's Health is the
// only bookkeeping that matters there. holderID doubles as the applier for
// any status it grants, and as the tag-setter for a lethal harm - matching
// every other self-originated effect.
//
// Deliberately simpler than ApplyPowerEffects: this fires reactively, from
// combat that's already happening (a trigger only evaluates true because
// something already engaged this unit), not from a fresh cast - so there's
// no range/LOS check, no EngageOnAttack, no cast pushback. affects: "target"
// resolves to holder's own current Target (nil target/no such unit is a
// no-op, not an error) - never the specific unit that caused the trigger to
// fire, which this package doesn't track.
func FireTriggeredEffect(holderID uuid.UUID, holder *instancestate.UnitState, eff instanceconfig.StatusEffect, zone instanceconfig.Zone, now time.Time, state *instancestate.InstanceState) float64 {
	te := eff.TriggeredEffect
	if te == nil {
		return 0
	}

	recipient, recipientID := holder, holderID
	if te.Affects == "target" {
		if holder.Target == nil {
			return 0
		}
		recipient = state.Units[*holder.Target]
		if recipient == nil {
			return 0
		}
		recipientID = *holder.Target
	}

	switch te.Type {
	case "harm":
		return fireHarm(holderID, holder, recipientID, recipient, eff, zone, state)
	case "heal":
		fireHeal(holder, recipient, eff, zone)
	case "resource":
		AdjustResource(recipient, te.ResourceName, te.Delta)
	case "status":
		if te.Status == nil {
			return 0
		}
		ApplyStatus(recipient, holder, holderID, *te.Status, te.Duration, zone, now)
	}
	return 0
}

func fireHarm(holderID uuid.UUID, holder *instancestate.UnitState, recipientID uuid.UUID, recipient *instancestate.UnitState, eff instanceconfig.StatusEffect, zone instanceconfig.Zone, state *instancestate.InstanceState) float64 {
	te := eff.TriggeredEffect
	if te.Amount == nil {
		return 0
	}
	if recipient.TaggedBy == nil && recipient.Hostility != "" {
		recipient.TaggedBy = &holderID
	}
	raw := TriggeredEffectAmount(holder, zone, eff, false)
	dealt := IncomingDamage(recipient, zone, raw, te.School != "magic")
	recipient.Health -= dealt
	if recipient.Health < 0 {
		recipient.Health = 0
	}
	if recipient.Health == 0 {
		recipient.Status = instancestate.UnitStatusDead
		recipient.Target = nil
		instancestate.RollAndRecordLoot(recipientID, recipient, state)
		if holder.Target != nil && *holder.Target == recipientID {
			holder.Target = nil
			holder.Attacking = false
		}
	}
	return dealt
}

func fireHeal(holder, recipient *instancestate.UnitState, eff instanceconfig.StatusEffect, zone instanceconfig.Zone) {
	if eff.TriggeredEffect.Amount == nil {
		return
	}
	amount := TriggeredEffectAmount(holder, zone, eff, true)
	recipient.Health += amount * (1 + HealingTakenPct(recipient, zone)/100)
	if recipient.Health > recipient.MaxHealth {
		recipient.Health = recipient.MaxHealth
	}
}
