package dpssim

import "math/rand"

// TargetStats is the target dummy's already-resolved final combat stats -
// post-itemization, post-elevation-scaling, post-Versatility-spread. This
// package takes them as a given rather than deriving them from gear: that
// derivation (itemstats.ScaledSum against a gearing plan and a relative
// elevation) belongs to the layer above this one, which will call Simulate
// once per (gearing plan x elevation) cell to build a DPS matrix.
type TargetStats struct {
	Strength      float64
	Agility       float64
	Intellect     float64
	DefenceRating float64
	MaxHealth     float64
}

// Mirrors internal/command/basic_attack_handler.go's same-named constants -
// see docs/stats.md's "Avoidance" and "Defence Rating and damage reduction"
// sections for the derivation.
const (
	avoidanceAsymptote = 0.6
	avoidanceHalfPoint = 250.0

	physicalDRAsymptote    = 0.6
	magicDRAsymptote       = 0.4 * physicalDRAsymptote
	defenceRatingHalfPoint = 98.0

	agilityPhysicalAvoidanceWeight = 0.66
	agilityMagicAvoidanceWeight    = 0.33

	baseMissChance     = 0.05
	baseCritMultiplier = 2.0

	// npcCritChancePct - command.effectSchoolStats/UnitCombatStats compute
	// critChancePct as 5 + (attacker's crit_rating + a stat term)/15; both
	// terms are always 0 for an NPC attacker (see package doc), so this
	// collapses to the flat base value for every NPC, every school.
	npcCritChancePct = 5.0
)

// rollOutcome mirrors command.RollAttackOutcome, fixed to npcCritChancePct
// (see package doc - an NPC attacker's own critChancePct is always 5%).
func rollOutcome(rng *rand.Rand) (missed bool, multiplier float64) {
	if rng.Float64() < baseMissChance {
		return true, 0
	}
	if rng.Float64() < npcCritChancePct/100 {
		return false, baseCritMultiplier
	}
	return false, 1.0
}

// incomingDamage mirrors command.IncomingDamage, operating directly on a
// TargetStats instead of a full instancestate.UnitState/instanceconfig.Zone
// pair - target's Strength/Agility/Intellect/DefenceRating are already
// final, so there's no unitEffectiveStats/Versatility-spread step to redo
// here.
func incomingDamage(target TargetStats, rawDamage float64, physical bool, rng *rand.Rand) float64 {
	var effectiveAvoidanceStat float64
	if physical {
		effectiveAvoidanceStat = target.Strength + target.Agility*agilityPhysicalAvoidanceWeight
	} else {
		effectiveAvoidanceStat = target.Intellect + target.Agility*agilityMagicAvoidanceWeight
	}
	avoidance := avoidanceAsymptote * effectiveAvoidanceStat / (effectiveAvoidanceStat + avoidanceHalfPoint)
	if rng.Float64() < avoidance {
		return 0
	}

	drAsymptote := physicalDRAsymptote
	if !physical {
		drAsymptote = magicDRAsymptote
	}
	dr := drAsymptote * target.DefenceRating / (target.DefenceRating + defenceRatingHalfPoint)
	return rawDamage * (1 - dr)
}
