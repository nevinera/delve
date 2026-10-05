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
type UsePowerHandler struct {
	// Rng backs every random roll this handler makes (harm/heal crit-miss
	// rolls, resist rolls) - set once at registration from Instance.Rand, so
	// a test can inject a seeded source instead of math/rand's package-level
	// global.
	Rng *rand.Rand
}

func (UsePowerHandler) Type() string      { return "use_power" }
func (UsePowerHandler) Deduplicate() bool { return false }

func (h UsePowerHandler) Handle(unitID uuid.UUID, payload CommandPayload, zone instanceconfig.Zone, next *instancestate.InstanceState) error {
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

	target, ok := ResolveCastTarget(unit, unit.Target, p.Power, zone, next)
	if !ok {
		return nil
	}

	if castTime := HastedCastSeconds(unit, zone, p.Power); castTime > 0 {
		unit.Casting = &instancestate.CastState{
			Power:     p.Power,
			TargetID:  unit.Target,
			StartedAt: now,
			EndsAt:    now.Add(time.Duration(castTime * float64(time.Second))),
		}
		commitCooldowns(unit, p.Power, now)
		return nil
	}

	if !ApplyPowerEffects(unitID, unit, target, unit.Target, p.Power, zone, now, next, h.Rng) {
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
// dead, undetected while stealthed (see CanSee), or (for a frontal power) no longer in front of the caster - the
// caller should treat that as "this cast/use does nothing".
//
// Exported so instance.tickCasts can re-run the same validation a completed
// cast-time power needs (the target's situation may have changed since cast
// start - see docs on UnitState.Casting) that Handle already runs for an
// instant power.
func ResolveCastTarget(unit *instancestate.UnitState, targetID *uuid.UUID, power instanceconfig.Power, zone instanceconfig.Zone, next *instancestate.InstanceState) (*instancestate.UnitState, bool) {
	needsTarget := false
	for _, eff := range power.Effects {
		if !isUntargetedAffects(eff.Affects) {
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
	if !ok || !target.Status.IsTargetable() || !CanSee(unit, target, zone) {
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
func ApplyPowerEffects(unitID uuid.UUID, unit, target *instancestate.UnitState, targetID *uuid.UUID, power instanceconfig.Power, zone instanceconfig.Zone, now time.Time, next *instancestate.InstanceState, rng *rand.Rand) bool {
	timeBudget := PowerEffectTimeBudget(power)
	for _, effect := range power.Effects {
		if !playerEffectUsable(effect) {
			continue
		}
		switch effect.Affects {
		case "self", "gAll":
			// No parties yet, so a player's gAll is just the caster.
			applyPlayerEffect(unitID, unit, unitID, unit, effect, timeBudget, zone, now, next, rng)
		case "bAll":
			for _, v := range playerAreaVictims(unit, effect, zone, next) {
				applyPlayerEffect(unitID, unit, v.id, v.unit, effect, timeBudget, zone, now, next, rng)
			}
		default:
			if target == nil {
				continue
			}
			if !inRangeAndLOS(unit, target, zone, effect.Range) {
				return false
			}
			if power.Speed > 0 {
				QueueImpact(next, instancestate.PendingImpact{
					CasterID: unitID, TargetID: *targetID, Effect: effect, TimeBudget: timeBudget,
					LandsAt: now.Add(ImpactDelay(unit, target, power)), FromPlayer: true,
				})
				continue
			}
			ApplyPlayerTargetedEffect(unitID, unit, *targetID, target, effect, timeBudget, zone, now, next, rng)
		}
	}
	return true
}

// ApplyPlayerTargetedEffect lands one effect a player aimed at target -
// directly, or when its projectile arrives - plus a bTarget radius's splash
// onto the NPCs around it. A gTarget radius reaches nobody else until there
// are parties.
func ApplyPlayerTargetedEffect(unitID uuid.UUID, unit *instancestate.UnitState, targetID uuid.UUID, target *instancestate.UnitState, effect instanceconfig.PowerEffect, timeBudget float64, zone instanceconfig.Zone, now time.Time, next *instancestate.InstanceState, rng *rand.Rand) {
	applyPlayerEffect(unitID, unit, targetID, target, effect, timeBudget, zone, now, next, rng)
	if effect.Radius > 0 && effect.Affects == "bTarget" {
		for _, v := range playerSplashVictims(unit, target, effect.Radius, zone, next) {
			applyPlayerEffect(unitID, unit, v.id, v.unit, effect, timeBudget, zone, now, next, rng)
		}
	}
}

// ImpactDelay is how long power's projectile takes to fly from unit to
// target: their distance over its Speed. The client times a travelling
// graphic the same way (game/effectPlayback.js).
func ImpactDelay(unit, target *instancestate.UnitState, power instanceconfig.Power) time.Duration {
	if power.Speed <= 0 {
		return 0
	}
	dx, dy := target.Position.X-unit.Position.X, target.Position.Y-unit.Position.Y
	return time.Duration(math.Sqrt(dx*dx+dy*dy) / power.Speed * float64(time.Second))
}

// QueueImpact puts an effect in flight; the instance lands it at LandsAt.
func QueueImpact(next *instancestate.InstanceState, impact instancestate.PendingImpact) {
	next.PendingImpacts = append(next.PendingImpacts, impact)
}

// isUntargetedAffects reports whether an effect lands without the caster
// needing a target: on itself, or on everyone around it.
func isUntargetedAffects(affects string) bool {
	return affects == "self" || affects == "bAll" || affects == "gAll"
}

// playerEffectUsable reports whether effect has what its type needs.
func playerEffectUsable(effect instanceconfig.PowerEffect) bool {
	switch effect.Type {
	case "harm", "heal":
		return effect.Amount != nil
	case "status":
		return effect.Status != nil
	case "resource":
		return true
	default:
		return false
	}
}

type areaVictim struct {
	id   uuid.UUID
	unit *instancestate.UnitState
}

// playerAreaVictims is everyone a player's bAll effect hits: every living,
// non-evading hostile or neutral NPC on the caster's map within the effect's
// range, with line of sight - never players or friendly NPCs.
func playerAreaVictims(unit *instancestate.UnitState, effect instanceconfig.PowerEffect, zone instanceconfig.Zone, next *instancestate.InstanceState) []areaVictim {
	var victims []areaVictim
	for id, u := range next.Units {
		if u == unit || u.MapIdentifier != unit.MapIdentifier || !u.Status.IsTargetable() || IsEvading(u) {
			continue
		}
		if u.Hostility != "hostile" && u.Hostility != "neutral" {
			continue
		}
		if inRangeAndLOS(unit, u, zone, effect.Range) {
			victims = append(victims, areaVictim{id, u})
		}
	}
	return victims
}

// playerSplashVictims is everyone else a player's bTarget radius hits: the
// living, non-evading hostile or neutral NPCs within radius of target (not
// target itself), with line of sight from target.
func playerSplashVictims(unit, target *instancestate.UnitState, radius float64, zone instanceconfig.Zone, next *instancestate.InstanceState) []areaVictim {
	var victims []areaVictim
	for id, u := range next.Units {
		if u == target || u == unit || u.MapIdentifier != target.MapIdentifier || !u.Status.IsTargetable() || IsEvading(u) {
			continue
		}
		if u.Hostility != "hostile" && u.Hostility != "neutral" {
			continue
		}
		if WithinRadius(target, u, zone, radius) {
			victims = append(victims, areaVictim{id, u})
		}
	}
	return victims
}

// WithinRadius reports whether u is within radius feet of center (edge to
// center: u's own radius counts) with line of sight from center - the test
// for a splash centered on a target. Shared with the NPC side.
func WithinRadius(center, u *instancestate.UnitState, zone instanceconfig.Zone, radius float64) bool {
	dx, dy := u.Position.X-center.Position.X, u.Position.Y-center.Position.Y
	if math.Sqrt(dx*dx+dy*dy) > radius+u.Radius {
		return false
	}
	return instanceconfig.LineOfSightClear(zone, center.MapIdentifier, center.Position.X, center.Position.Y, u.Position.X, u.Position.Y)
}

// applyPlayerEffect applies one effect from a player (unit) to a single
// recipient that's already passed its range/LOS checks. The recipient may be
// the caster itself.
func applyPlayerEffect(unitID uuid.UUID, unit *instancestate.UnitState, recipientID uuid.UUID, recipient *instancestate.UnitState, effect instanceconfig.PowerEffect, timeBudget float64, zone instanceconfig.Zone, now time.Time, next *instancestate.InstanceState, rng *rand.Rand) {
	self := recipient == unit
	switch effect.Type {
	case "harm":
		if self {
			return
		}
		applyPlayerHarm(unitID, unit, recipientID, recipient, effect, timeBudget, zone, next, rng)
	case "status":
		if !self {
			// Casting at a hostile target is an attack too - it aggros
			// an idle hostile target and can be resisted, same as harm.
			// Resistibility is a property of this cast (who it's aimed
			// at), not of the Status itself - see IsHostileAffects.
			EngageOnAttack(recipient, unitID, zone, next)
			if IsHostileAffects(effect.Affects) && rng.Float64() < baseMissChance {
				return // resisted
			}
		}
		ApplyStatus(recipient, unit, unitID, *effect.Status, effect.Duration, zone, now)
	case "heal":
		if !self && IsEvading(recipient) {
			return
		}
		amount := PowerEffectAmount(unit, zone, effect, timeBudget, true, false, rng)
		ApplyHeal(unit, recipient, amount, zone)
	case "resource":
		if !self && IsEvading(recipient) {
			return
		}
		AdjustResource(recipient, effect.ResourceName, effect.Delta)
	}
}

func applyPlayerHarm(unitID uuid.UUID, unit *instancestate.UnitState, victimID uuid.UUID, victim *instancestate.UnitState, effect instanceconfig.PowerEffect, timeBudget float64, zone instanceconfig.Zone, next *instancestate.InstanceState, rng *rand.Rand) {
	unit.Attacking = true
	if victim.TaggedBy == nil && victim.Hostility != "" && !IsEvading(victim) {
		victim.TaggedBy = &unitID
	}
	EngageOnAttack(victim, unitID, zone, next)
	raw := PowerEffectAmount(unit, zone, effect, timeBudget, false, false, rng)
	dealt := IncomingDamage(victim, zone, raw, effect.School != "magic", rng)
	victim.Health -= dealt
	AddThreat(victim, unitID, dealt)
	if dealt > 0 {
		ApplyCastPushback(victim)
		unit.DamageDealtThisTick = true
		victim.DamageTakenThisTick = true
	}
	if victim.Health < 0 {
		victim.Health = 0
	}
	if victim.Health == 0 {
		victim.Status = instancestate.UnitStatusDead
		victim.Target = nil
		instancestate.RollAndRecordLoot(victimID, victim, next, rng)
		if unit.Target != nil && *unit.Target == victimID {
			unit.Target = nil
			unit.Attacking = false
		}
	}
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
	unit.GlobalCooldownEndsAt = now.Add(time.Duration(HastedGlobalCooldownSeconds(unit, power) * float64(time.Second)))
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
