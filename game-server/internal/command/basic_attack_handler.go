package command

import (
	"math"
	"math/rand"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
	"github.com/delve-mmo/game-server/internal/itemstats"
)

// characterBasicAttackRange is a flat placeholder: every character
// basic-attacks at the same range regardless of class or equipped weapon.
// characterBasicAttackNominalInterval is the swing timer before Haste - see
// docs/stats.md's "Basic Attack DPS" section for the rest of this formula.
const (
	characterBasicAttackRange           = 5.0
	characterBasicAttackNominalInterval = 2 * time.Second
	characterBasicAttackBaseDPS         = 1.0 // a fully naked character's own DPS
	characterBasicAttackVariance        = 0.1 // each swing's damage is uniform within +/-10% of nominal

	// baseMissChance/baseCritMultiplier are universal, not basic-attack-
	// specific: every basic attack (player or NPC) and every harmful power
	// effect rolls the same flat 5% chance to miss (a spell's miss is
	// narratively a "resist") and the same crit multiplier on the
	// per-effect critChancePct from UnitCombatStats/effectSchoolStats - see
	// docs/stats.md's "Miss Chance" and tmp/plan.md.
	baseMissChance     = 0.05
	baseCritMultiplier = 2.0

	// basicAttackStatDPSDivisor - see docs/stats.md's Strength/Agility/
	// Intellect sections. Solved backward from a design target (a fully-
	// itemized, on-level DPS build - primary maxed on the damage stat,
	// secondaries split evenly Crit/Haste - should net 5 basic-attack DPS
	// regardless of which of the three stats it's built around); Strength,
	// Agility, and Intellect solve to ~89/~92/~91 respectively under that
	// target, close enough to collapse into one shared divisor.
	basicAttackStatDPSDivisor = 90.0

	// physicalCritRatingPerStrength/physicalHasteRatingPerAgility - Strength
	// and Agility each always grant one physical secondary, regardless of
	// class (docs/stats.md's Crit Rating/Haste Rating sections).
	physicalCritRatingPerStrength = 0.6
	physicalHasteRatingPerAgility = 0.6
	// magicCritRatingPerIntellect/magicHasteRatingPerIntellect - Intellect
	// splits the equivalent budget across both magic secondaries instead of
	// concentrating it in one.
	magicCritRatingPerIntellect  = 0.3
	magicHasteRatingPerIntellect = 0.3

	// versatilityStatWeight - Versatility spreads this fraction of itself into
	// Strength, Agility, Intellect, and Defence Rating alike (docs/stats.md's
	// "Versatility" section).
	versatilityStatWeight = 0.2

	// agilityPhysicalAvoidanceWeight/agilityMagicAvoidanceWeight -
	// Strength/Intellect each grant a pure Avoidance chance for their own
	// attack type, and Agility splits a weaker share of both (docs/stats.md's
	// "Avoidance" section).
	agilityPhysicalAvoidanceWeight = 0.66
	agilityMagicAvoidanceWeight    = 0.33
	avoidanceAsymptote             = 0.6
	avoidanceHalfPoint             = 250.0

	// physicalDRAsymptote/magicDRAsymptote - see docs/stats.md's "Defence
	// Rating and damage reduction".
	physicalDRAsymptote    = 0.6
	magicDRAsymptote       = 0.4 * physicalDRAsymptote
	defenceRatingHalfPoint = 98.0

	// playerBaseMaxHealth/maxHealthPerStamina - see docs/stats.md's
	// "Stamina" section: MaxHP = 100 + Stamina * 10.
	playerBaseMaxHealth = 100.0
	maxHealthPerStamina = 10.0
)

// BasicAttackHandler executes one swing of a player unit's basic attack
// against its current target, gated by the swing timer.
type BasicAttackHandler struct{}

func (BasicAttackHandler) Type() string      { return "basic_attack" }
func (BasicAttackHandler) Deduplicate() bool { return false }

func (BasicAttackHandler) Handle(unitID uuid.UUID, payload CommandPayload, zone instanceconfig.Zone, next *instancestate.InstanceState) error {
	if _, ok := payload.(BasicAttackPayload); !ok {
		return nil
	}
	unit, ok := next.Units[unitID]
	if !ok || unit.Status == instancestate.UnitStatusDead {
		return nil
	}
	if !unit.Attacking || unit.Target == nil {
		return nil
	}
	now := time.Now()
	if now.Before(unit.NextBasicAttackAt) {
		return nil
	}

	target, ok := next.Units[*unit.Target]
	if !ok || target.Status == instancestate.UnitStatusDead {
		return nil
	}

	dx := target.Position.X - unit.Position.X
	dy := target.Position.Y - unit.Position.Y
	if math.Sqrt(dx*dx+dy*dy) > characterBasicAttackRange+unit.Radius+target.Radius {
		return nil
	}
	if !instanceconfig.LineOfSightClear(zone, unit.MapIdentifier, unit.Position.X, unit.Position.Y, target.Position.X, target.Position.Y) {
		return nil
	}

	hastePct, critChancePct, statDPS := UnitCombatStats(unit, zone)
	interval := PlayerBasicAttackInterval(hastePct)
	unit.NextBasicAttackAt = now.Add(interval)
	next.PendingCombatEvents = append(next.PendingCombatEvents, instancestate.CombatEvent{
		AttackerID: unitID.String(),
		TargetID:   unit.Target.String(),
		PowerName:  "Basic Attack",
	})

	if target.TaggedBy == nil && target.Hostility != "" {
		target.TaggedBy = &unitID
	}
	EngageOnAttack(target, unitID, zone, next)
	physical := unit.DamageStatKey != "intellect"
	raw := BasicAttackDamage(critChancePct, statDPS)
	raw = ApplyDamageDoneBonus(unit, physical, raw)
	target.Health -= IncomingDamage(target, zone, raw, physical)
	if target.Health < 0 {
		target.Health = 0
	}
	if target.Health == 0 {
		target.Status = instancestate.UnitStatusDead
		target.Target = nil
		instancestate.RollAndRecordLoot(*unit.Target, target, next)
		unit.Target = nil
		unit.Attacking = false
	}
	return nil
}

// UnitCombatStats scales the unit's equipped items against its current map's
// elevation (see instanceconfig.Zone.MapElvl) and derives the totals its
// basic attack needs: Haste%, Crit Chance%, and the class damage stat's DPS
// contribution (0 for NPCs and for a class with none of Strength/Agility/
// Intellect as a damage stat). A physical basic attack (Strength/Agility)
// and a magic one (Intellect) draw from separate Crit/Haste pools - see
// docs/stats.md.
func UnitCombatStats(unit *instancestate.UnitState, zone instanceconfig.Zone) (hastePct, critChancePct, statDPS float64) {
	strength, agility, intellect, _, stats := unitEffectiveStats(unit, zone)

	school := "physical"
	switch unit.DamageStatKey {
	case "strength", "agility":
		// Strength always grants physical Crit, Agility always grants
		// physical Haste, regardless of which of the two is the class's
		// damage stat - see docs/stats.md's Crit Rating/Haste Rating.
		hastePct = (stats["haste_rating"] + agility*physicalHasteRatingPerAgility) / 11.71
		critChancePct = 5 + (stats["crit_rating"]+strength*physicalCritRatingPerStrength)/15
		if unit.DamageStatKey == "strength" {
			statDPS = strength / basicAttackStatDPSDivisor
		} else {
			statDPS = agility / basicAttackStatDPSDivisor
		}
	case "intellect":
		school = "magic"
		hastePct = (stats["haste_rating"] + intellect*magicHasteRatingPerIntellect) / 11.71
		critChancePct = 5 + (stats["crit_rating"]+intellect*magicCritRatingPerIntellect)/15
		statDPS = intellect / basicAttackStatDPSDivisor
	default:
		hastePct = stats["haste_rating"] / 11.71
		critChancePct = 5 + stats["crit_rating"]/15
	}

	mods := ActiveStatModifiers(unit)
	hastePct = applyTier2SchoolPct(mods, school, "Haste", hastePct)
	critChancePct = applyTier2SchoolPct(mods, school, "CritChance", critChancePct)
	return hastePct, critChancePct, statDPS
}

// unitEffectiveStats scales unit's equipped items against its current map's
// elevation and spreads Versatility Rating's 0.2x share into Strength,
// Agility, Intellect, and Defence Rating (docs/stats.md's "Versatility").
// NPCs have no EquippedItems, so every return value is 0 for them.
func unitEffectiveStats(unit *instancestate.UnitState, zone instanceconfig.Zone) (strength, agility, intellect, defenceRating float64, stats map[string]float64) {
	allocations := make([]itemstats.Allocation, 0, len(unit.EquippedItems))
	for _, item := range unit.EquippedItems {
		allocations = append(allocations, itemstats.Allocation{
			Slot:        item.Slot,
			Shield:      item.Shield,
			Primary:     item.PrimaryStat,
			Secondaries: item.SecondaryStats,
			Elvl:        item.Elvl,
		})
	}
	stats = itemstats.ScaledSum(allocations, zone.MapElvl(unit.MapIdentifier))
	applyTier1StatusModifiers(unit, stats)

	versatility := stats["versatility_rating"]
	strength = stats["strength"] + versatility*versatilityStatWeight
	agility = stats["agility"] + versatility*versatilityStatWeight
	intellect = stats["intellect"] + versatility*versatilityStatWeight
	defenceRating = stats["defence_rating"] + versatility*versatilityStatWeight
	return strength, agility, intellect, defenceRating, stats
}

// tier1StatNames maps docs/schema/status.md's Tier 1 "stat" StatusEffect
// statName values (camelCase, matching the status schema) to the
// snake_case keys used throughout this package's stats map (matching
// itemized-gear JSON field names) - the two conventions come from
// different places and were never unified.
var tier1StatNames = map[string]string{
	"strength":          "strength",
	"agility":           "agility",
	"intellect":         "intellect",
	"stamina":           "stamina",
	"critRating":        "crit_rating",
	"hasteRating":       "haste_rating",
	"masteryRating":     "mastery_rating",
	"versatilityRating": "versatility_rating",
	"defenceRating":     "defence_rating",
}

// applyTier1StatusModifiers folds every active "stat" StatusEffect
// targeting a Tier 1 stat (docs/stats.md) into stats, in place - see
// ActiveStatModifiers. Applied before the Versatility spread below, so a
// status-boosted versatility_rating spreads its boosted share too.
func applyTier1StatusModifiers(unit *instancestate.UnitState, stats map[string]float64) {
	mods := ActiveStatModifiers(unit)
	for statusName, key := range tier1StatNames {
		add, multiply := mods.Get(statusName)
		if add == 0 && multiply == 1 {
			continue
		}
		stats[key] = (stats[key] + add) * multiply
	}
}

// PlayerMaxHealth computes a player's MaxHealth from their currently
// equipped Stamina - see docs/stats.md's "Stamina" section. Unlike
// Strength/Agility/Intellect/Defence Rating, Stamina gets no Versatility
// spread (see "Versatility"), so it's read straight off unitEffectiveStats'
// stats map. Elvl-scaled the same way every other gear-derived stat is
// (via unitEffectiveStats/itemstats.ScaledSum), so this needs recomputing
// whenever gear or map elevation changes - it's not a one-time spawn value.
func PlayerMaxHealth(unit *instancestate.UnitState, zone instanceconfig.Zone) float64 {
	_, _, _, _, stats := unitEffectiveStats(unit, zone)
	base := playerBaseMaxHealth + stats["stamina"]*maxHealthPerStamina
	add, multiply := ActiveStatModifiers(unit).Get("maxHealth")
	return (base + add) * multiply
}

// IncomingDamage rolls target's Avoidance for an attack of the given school,
// then applies target's Defence Rating reduction to whatever isn't avoided.
// Returns the actual damage to subtract from target's health (0 if avoided).
// Avoidance is checked first, then DR reduces what lands - the two layers
// aren't applied to the same portion of damage twice (docs/stats.md's
// "Miss Chance" section). NPCs have no EquippedItems, so both are 0 for them
// - only players currently have any incoming-damage mitigation.
func IncomingDamage(target *instancestate.UnitState, zone instanceconfig.Zone, rawDamage float64, physical bool) float64 {
	strength, agility, intellect, defenceRating, _ := unitEffectiveStats(target, zone)
	mods := ActiveStatModifiers(target)
	school := "physical"
	if !physical {
		school = "magic"
	}

	var effectiveAvoidanceStat float64
	if physical {
		effectiveAvoidanceStat = strength + agility*agilityPhysicalAvoidanceWeight
	} else {
		effectiveAvoidanceStat = intellect + agility*agilityMagicAvoidanceWeight
	}
	avoidancePct := 100 * avoidanceAsymptote * effectiveAvoidanceStat / (effectiveAvoidanceStat + avoidanceHalfPoint)
	avoidancePct = applyTier2SchoolPct(mods, school, "Avoidance", avoidancePct)
	if rand.Float64() < avoidancePct/100 {
		return 0
	}

	drAsymptote := physicalDRAsymptote
	if !physical {
		drAsymptote = magicDRAsymptote
	}
	drPct := 100 * drAsymptote * defenceRating / (defenceRating + defenceRatingHalfPoint)
	drPct = applyTier2SchoolPct(mods, school, "Mitigation", drPct)
	dr := drPct / 100

	damage := rawDamage * (1 - dr)
	return applySchoolStatBonus(mods, "damageTaken", school+"DamageTaken", damage)
}

// RollAttackOutcome applies the universal miss/crit roll shared by every
// basic attack (player or NPC) and harmful power effect: baseMissChance to
// miss outright (missed=true, multiplier meaningless), else a
// critChancePct-based roll between 1.0 and baseCritMultiplier.
func RollAttackOutcome(critChancePct float64) (missed bool, multiplier float64) {
	if rand.Float64() < baseMissChance {
		return true, 0
	}
	if rand.Float64() < critChancePct/100 {
		return false, baseCritMultiplier
	}
	return false, 1.0
}

// BasicAttackDamage rolls one swing's outcome - miss, normal hit, or crit -
// and returns the damage dealt (0 on a miss). See docs/stats.md's "Basic
// Attack DPS" section: nominalSwingDamage is what DPS*nominalInterval would
// deal every swing before the miss/crit/variance rolls are applied. A
// landed hit varies uniformly within +/-10% of that nominal value, so
// swings aren't all identical even absent a crit. Exported (alongside
// PlayerBasicAttackInterval) so a DPS simulator (internal/classdps) can
// reuse the real formula instead of re-deriving it.
func BasicAttackDamage(critChancePct, statDPS float64) float64 {
	missed, multiplier := RollAttackOutcome(critChancePct)
	if missed {
		return 0
	}
	nominalSwingDamage := (characterBasicAttackBaseDPS + statDPS) * characterBasicAttackNominalInterval.Seconds()
	variance := 1 + (rand.Float64()*2-1)*characterBasicAttackVariance
	return math.Round(nominalSwingDamage * variance * multiplier)
}

// PlayerBasicAttackInterval is the time between a player's basic attacks at
// hastePct - see docs/stats.md's "Basic Attack DPS" section.
func PlayerBasicAttackInterval(hastePct float64) time.Duration {
	return time.Duration(float64(characterBasicAttackNominalInterval) / (1 + hastePct/100))
}
