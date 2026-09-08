package command

import (
	"math"
	"math/rand"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// effectSchoolStats computes the Haste%, Crit Chance%, and stat-DPS
// contribution a caster brings to one power effect of the given school -
// "physical" (default) or "magic". Unlike UnitCombatStats (basic attacks,
// keyed off unit.DamageStatKey), this is keyed off the effect's own school,
// since a caster's powers aren't restricted to their basic attack's school -
// see docs/stats.md's Crit Rating/Haste Rating/Strength/Agility/Intellect
// sections and tmp/plan.md's status-implementation step 0.
func effectSchoolStats(unit *instancestate.UnitState, zone instanceconfig.Zone, school string) (hastePct, critChancePct, statContribution float64) {
	strength, agility, intellect, _, stats := unitEffectiveStats(unit, zone)

	if school == "magic" {
		// Intellect is always the magic-power driver, regardless of the
		// caster's own DamageStatKey - matches basic attack's magic branch
		// and healing always being treated as magic (see docs/stats.md).
		hastePct = (stats["haste_rating"] + intellect*magicHasteRatingPerIntellect) / 11.71
		critChancePct = 5 + (stats["crit_rating"]+intellect*magicCritRatingPerIntellect)/15
		return hastePct, critChancePct, intellect
	}

	// physical (default). Strength/Agility "always grant one physical
	// secondary, regardless of class" (docs/stats.md) - unlike
	// UnitCombatStats, this isn't gated by DamageStatKey; only which stat
	// drives the amount bonus is.
	hastePct = (stats["haste_rating"] + agility*physicalHasteRatingPerAgility) / 11.71
	critChancePct = 5 + (stats["crit_rating"]+strength*physicalCritRatingPerStrength)/15
	switch unit.DamageStatKey {
	case "strength":
		statContribution = strength
	case "agility":
		statContribution = agility
	}
	return hastePct, critChancePct, statContribution
}

// IsHostileAffects reports whether a PowerEffect.Affects value targets a
// hostile unit ("bTarget"/"bAll") - the property of the *cast*, not of any
// Status it might apply, that determines whether it can be resisted. A
// Status's own TreatAs is purely a display flavor (buff/debuff/inherent)
// and says nothing about who it's being cast at - the same status could in
// principle be granted to an ally or forced onto an enemy.
func IsHostileAffects(affects string) bool {
	return affects == "bTarget" || affects == "bAll"
}

// inRangeAndLOS reports whether target is within effRange (defaulting to
// 5ft melee when nil, plus both units' radii) of unit and has a clear line
// of sight, shared by harm and target-heal effects.
func inRangeAndLOS(unit, target *instancestate.UnitState, zone instanceconfig.Zone, effRange *instanceconfig.ZeroBasedValueRange) bool {
	maxRange := 5.0
	if effRange != nil {
		maxRange = effRange.Max()
	}
	maxRange += unit.Radius + target.Radius
	dx := target.Position.X - unit.Position.X
	dy := target.Position.Y - unit.Position.Y
	if math.Sqrt(dx*dx+dy*dy) > maxRange {
		return false
	}
	return instanceconfig.LineOfSightClear(zone, unit.MapIdentifier, unit.Position.X, unit.Position.Y, target.Position.X, target.Position.Y)
}

// PowerEffectTimeBudget is the time (seconds) an instant harm/heal effect's
// stat-DPS bonus is normalized against - the "if this were spammable every
// GCD" coefficient convention, regardless of the power's own (possibly much
// longer) individual cooldown.
func PowerEffectTimeBudget(power instanceconfig.Power) float64 {
	if power.CastTime != nil && *power.CastTime > 0 {
		return *power.CastTime
	}
	return power.GlobalCooldown
}

// PowerEffectAmount rolls one harm/heal effect's final amount: the authored
// range, plus a stat-DPS bonus converted to a per-use amount via timeBudget,
// then a crit roll on top. Healing is always treated as magic (Intellect,
// magic Crit) and its bonus is doubled relative to the same-shaped harm
// bonus; a recurring (status tick) effect's bonus gets a further 2x
// premium. See tmp/plan.md's status-implementation step 0 for the full
// derivation.
//
// harm effects also roll RollAttackOutcome's universal miss chance (a
// spell's miss is narratively a "resist") - a miss returns 0 outright, same
// as basicAttackDamage. heal effects aren't attacks, so they only roll
// crit, never miss.
func PowerEffectAmount(unit *instancestate.UnitState, zone instanceconfig.Zone, effect instanceconfig.PowerEffect, timeBudget float64, isHeal bool, isRecurring bool) float64 {
	lo, hi := effect.Amount.Min(), effect.Amount.Max()
	rolled := lo + rand.Float64()*(hi-lo)
	return effectAmount(unit, zone, effect.School, rolled, timeBudget, isHeal, isRecurring)
}

// StatusTickAmount rolls one recurring StatusEffect's tick amount - the same
// stat-scaling/crit/miss math as PowerEffectAmount, but the base amount is
// the tick's own fixed Amount (not a rolled range) and isRecurring is always
// true. timeBudget should be the effect's own (unhasted) TickRate - Haste
// speeds up how *often* a tick fires (see EffectHastePct/tmp/plan.md step 6),
// not the per-tick amount, so it isn't double-counted here.
func StatusTickAmount(unit *instancestate.UnitState, zone instanceconfig.Zone, effect instanceconfig.StatusEffect, timeBudget float64, isHeal bool) float64 {
	return effectAmount(unit, zone, effect.School, effect.Amount, timeBudget, isHeal, true)
}

// EffectHastePct returns the Haste% that should scale a recurring status
// tick's interval, for the tick's own school - the applier's *current*
// stats, recomputed fresh every call (never snapshotted at apply time), so
// a mid-duration Haste change speeds up the very next tick. Returns 0 if
// applier is nil (e.g. they've left the instance since applying it).
func EffectHastePct(applier *instancestate.UnitState, zone instanceconfig.Zone, school string) float64 {
	if applier == nil {
		return 0
	}
	hastePct, _, _ := effectSchoolStats(applier, zone, school)
	return hastePct
}

// RecurringTickInterval is the seconds until a recurring StatusEffect's next
// tick, given applier's Haste *as of right now* - this is computed once
// each time a tick is scheduled (when the status is applied, and again each
// time a tick subsequently fires - see instancestate.ActiveStatusEffect.
// TimeUntilNextTick), not continuously re-evaluated in between.
func RecurringTickInterval(applier *instancestate.UnitState, zone instanceconfig.Zone, effect instanceconfig.StatusEffect) float64 {
	interval := effect.TickRate / (1 + EffectHastePct(applier, zone, effect.School)/100)
	if interval <= 0 {
		return effect.TickRate
	}
	return interval
}

// effectAmount is the shared stat-scaling/crit/miss math behind
// PowerEffectAmount and StatusTickAmount: rolled is the base amount before
// any bonus (an authored-range roll for a harm/heal effect, or a status
// tick's own fixed Amount). Healing is always treated as magic (Intellect,
// magic Crit) and its bonus is doubled relative to the same-shaped harm
// bonus; a recurring (status tick) effect's bonus gets a further 2x
// premium. See tmp/plan.md's status-implementation step 0 for the full
// derivation.
//
// Non-heal effects also roll RollAttackOutcome's universal miss chance (a
// spell's miss is narratively a "resist") - a miss returns 0 outright, same
// as basicAttackDamage. heal effects aren't attacks, so they only roll
// crit, never miss.
func effectAmount(unit *instancestate.UnitState, zone instanceconfig.Zone, school string, rolled float64, timeBudget float64, isHeal bool, isRecurring bool) float64 {
	if isHeal {
		school = "magic"
	}
	_, critChancePct, statContribution := effectSchoolStats(unit, zone, school)

	var multiplier float64
	if isHeal {
		multiplier = 1.0
		if rand.Float64() < critChancePct/100 {
			multiplier = baseCritMultiplier
		}
	} else {
		missed, m := RollAttackOutcome(critChancePct)
		if missed {
			return 0
		}
		multiplier = m
	}

	k := statContribution / basicAttackStatDPSDivisor
	bonus := k * timeBudget
	if isHeal {
		bonus *= 2
	}
	if isRecurring {
		bonus *= 2
	}

	return math.Round((rolled + bonus) * multiplier)
}
