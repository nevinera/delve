package command

import (
	"math"
	"math/rand"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// UsePowerHandler executes a player's resolved power against their current target.
type UsePowerHandler struct{}

func (UsePowerHandler) Type() string      { return "use_power" }
func (UsePowerHandler) Deduplicate() bool { return false }

func (UsePowerHandler) Handle(unitID uuid.UUID, payload CommandPayload, zone instanceconfig.Zone, next *instancestate.InstanceState) error {
	p, ok := payload.(UsePowerPayload)
	if !ok {
		return nil
	}
	unit, ok := next.Units[unitID]
	if !ok || unit.Status == instancestate.UnitStatusDead {
		return nil
	}
	if unit.Casting != nil {
		return nil
	}
	now := time.Now()
	if !PowerUsable(unit, p.Power, now) {
		return nil
	}

	target, ok := ResolveCastTarget(unit, unit.Target, p.Power, next)
	if !ok {
		return nil
	}

	if castTime := p.Power.CastTime; castTime != nil && *castTime > 0 {
		unit.Casting = &instancestate.CastState{
			Power:     p.Power,
			TargetID:  unit.Target,
			StartedAt: now,
			EndsAt:    now.Add(time.Duration(*castTime * float64(time.Second))),
		}
		commitCooldowns(unit, p.Power, now)
		return nil
	}

	if !ApplyPowerEffects(unitID, unit, target, unit.Target, p.Power, zone, now, next) {
		return nil
	}
	commitPowerCostAndCooldowns(unit, p.Power, now)
	return nil
}

// ResolveCastTarget validates power's target requirement against targetID (the
// caster's current target, or - when resolving a cast-time power at
// completion - the target snapshotted at cast start) and, for a frontal
// power, the caster's current facing. Returns (nil, true) for a power that
// needs no target. Returns (_, false) if a target is required but missing,
// dead, or (for a frontal power) no longer in front of the caster - the
// caller should treat that as "this cast/use does nothing".
//
// Exported so instance.tickCasts can re-run the same validation a completed
// cast-time power needs (the target's situation may have changed since cast
// start - see docs on UnitState.Casting) that Handle already runs for an
// instant power.
func ResolveCastTarget(unit *instancestate.UnitState, targetID *uuid.UUID, power instanceconfig.Power, next *instancestate.InstanceState) (*instancestate.UnitState, bool) {
	needsTarget := false
	for _, eff := range power.Effects {
		if eff.Affects != "self" {
			needsTarget = true
			break
		}
	}
	if !needsTarget {
		return nil, true
	}

	if targetID == nil {
		return nil, false
	}
	target, ok := next.Units[*targetID]
	if !ok || target.Status == instancestate.UnitStatusDead {
		return nil, false
	}

	if power.IsFrontal() {
		dx := target.Position.X - unit.Position.X
		dy := target.Position.Y - unit.Position.Y
		toTarget := math.Atan2(dx, dy) * 180 / math.Pi
		diff := toTarget - unit.Position.Angle
		for diff > 180 {
			diff -= 360
		}
		for diff < -180 {
			diff += 360
		}
		if math.Abs(diff) > 75 {
			return nil, false
		}
	}

	return target, true
}

// ApplyPowerEffects applies every one of power's effects from unit against
// target (nil for a self-only power); targetID is target's own unit ID (nil
// iff target is nil) - kept separate from unit.Target since by the time a
// cast-time power resolves, the caster may have since retargeted. Returns
// false if a harm/status/heal/resource effect's range/LOS check failed
// partway through - matching Handle's own original all-or-nothing-cost
// behavior for an instant cast: effects already applied before the failure
// stay applied, but the caller should not charge cost for an incomplete
// cast. A cast-time power's completion (instance.tickCasts) uses this
// return value to decide whether to call SpendPowerCost - see its own docs.
//
// Exported so instance.tickCasts can resolve a completed cast-time power's
// effects the same way an instant power applies them.
func ApplyPowerEffects(unitID uuid.UUID, unit, target *instancestate.UnitState, targetID *uuid.UUID, power instanceconfig.Power, zone instanceconfig.Zone, now time.Time, next *instancestate.InstanceState) bool {
	timeBudget := PowerEffectTimeBudget(power)
	for _, effect := range power.Effects {
		switch effect.Type {
		case "harm":
			if target == nil {
				continue
			}
			if !inRangeAndLOS(unit, target, zone, effect.Range) {
				return false
			}
			unit.Attacking = true
			if effect.Amount != nil {
				if target.TaggedBy == nil && target.Hostility != "" {
					target.TaggedBy = &unitID
				}
				EngageOnAttack(target, unitID, zone, next)
				raw := PowerEffectAmount(unit, zone, effect, timeBudget, false, false)
				dealt := IncomingDamage(target, zone, raw, effect.School != "magic")
				target.Health -= dealt
				if dealt > 0 {
					ApplyCastPushback(target)
				}
				if target.Health < 0 {
					target.Health = 0
				}
				if target.Health == 0 {
					target.Status = instancestate.UnitStatusDead
					target.Target = nil
					instancestate.RollAndRecordLoot(*targetID, target, next)
					if unit.Target != nil && *unit.Target == *targetID {
						unit.Target = nil
						unit.Attacking = false
					}
				}
			}
		case "status":
			if effect.Status == nil {
				continue
			}
			recipient := unit
			if effect.Affects != "self" {
				if target == nil {
					continue
				}
				if !inRangeAndLOS(unit, target, zone, effect.Range) {
					return false
				}
				recipient = target
				// Casting at a hostile target is an attack too - it aggros
				// an idle hostile target and can be resisted, same as harm.
				// Resistibility is a property of this cast (who it's aimed
				// at), not of the Status itself - see IsHostileAffects.
				EngageOnAttack(target, unitID, zone, next)
				if IsHostileAffects(effect.Affects) && rand.Float64() < baseMissChance {
					continue // resisted
				}
			}
			ApplyStatus(recipient, unit, unitID, *effect.Status, effect.Duration, zone, now)
		case "heal":
			if effect.Amount == nil {
				continue
			}
			recipient := unit
			if effect.Affects != "self" {
				if target == nil {
					continue
				}
				if !inRangeAndLOS(unit, target, zone, effect.Range) {
					return false
				}
				recipient = target
			}
			amount := PowerEffectAmount(unit, zone, effect, timeBudget, true, false)
			recipient.Health += amount * (1 + HealingTakenPct(recipient, zone)/100)
			if recipient.Health > recipient.MaxHealth {
				recipient.Health = recipient.MaxHealth
			}
		case "resource":
			recipient := unit
			if effect.Affects != "self" {
				if target == nil {
					continue
				}
				if !inRangeAndLOS(unit, target, zone, effect.Range) {
					return false
				}
				recipient = target
			}
			AdjustResource(recipient, effect.ResourceName, effect.Delta)
		}
	}
	return true
}

// commitPowerCostAndCooldowns spends power's resource cost and starts its
// GCD/own cooldown, for a successful instant power (its effects already
// applied by the time this is called). A cast-time power instead splits
// this into commitCooldowns (cast start) and SpendPowerCost (cast
// completion, cost only) - see their own docs.
func commitPowerCostAndCooldowns(unit *instancestate.UnitState, power instanceconfig.Power, now time.Time) {
	SpendPowerCost(unit, power)
	commitCooldowns(unit, power, now)
}

// commitCooldowns starts power's GCD/own cooldown - for an instant power,
// called via commitPowerCostAndCooldowns after its effects succeed; for a
// cast-time power, called at cast *start* (Handle), locking in the timing
// commitment (can't start another cast/power until it's done) independently
// of whether the cast ultimately resolves.
func commitCooldowns(unit *instancestate.UnitState, power instanceconfig.Power, now time.Time) {
	unit.GlobalCooldownEndsAt = now.Add(time.Duration(power.GlobalCooldown * float64(time.Second)))
	if power.Cooldown > 0 {
		if unit.PowerCooldowns == nil {
			unit.PowerCooldowns = make(map[string]time.Time)
		}
		unit.PowerCooldowns[power.Name] = now.Add(time.Duration(power.Cooldown * float64(time.Second)))
	}
}

// SpendPowerCost deducts power's resource cost, if any. For a cast-time
// power this is charged only on successful completion (instance.tickCasts,
// once ApplyPowerEffects reports success) - not at cast start, and not on a
// cast that's aborted (target died) or fizzles (still out of range/LOS at
// completion): a cast that never actually did anything shouldn't cost
// anything either, so starting a cast only requires having enough
// resources, not committing them up front.
//
// Exported so instance.tickCasts can charge a completed cast-time power's
// cost the same way an instant power's is charged.
func SpendPowerCost(unit *instancestate.UnitState, power instanceconfig.Power) {
	if power.CostAmount > 0 {
		AdjustResource(unit, power.CostType, -power.CostAmount)
	}
}
