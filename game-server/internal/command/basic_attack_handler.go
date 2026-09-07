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
	characterBasicAttackMissChance      = 0.05
	characterBasicAttackCritMultiplier  = 2.0
	characterBasicAttackVariance        = 0.1 // each swing's damage is uniform within +/-10% of nominal

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

	hastePct, critChancePct, statDPS := unitCombatStats(unit, zone)
	interval := time.Duration(float64(characterBasicAttackNominalInterval) / (1 + hastePct/100))
	unit.NextBasicAttackAt = now.Add(interval)
	next.PendingCombatEvents = append(next.PendingCombatEvents, instancestate.CombatEvent{
		AttackerID: unitID.String(),
		TargetID:   unit.Target.String(),
		PowerName:  "Basic Attack",
	})

	if target.TaggedBy == nil && target.Hostility != "" {
		target.TaggedBy = &unitID
	}
	engageOnAttack(target, unitID, zone, next)
	raw := basicAttackDamage(critChancePct, statDPS)
	target.Health -= IncomingDamage(target, zone, raw, unit.DamageStatKey != "intellect")
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

// unitCombatStats scales the unit's equipped items against its current map's
// elevation (see instanceconfig.Zone.MapElvl) and derives the totals its
// basic attack needs: Haste%, Crit Chance%, and the class damage stat's DPS
// contribution (0 for NPCs and for a class with none of Strength/Agility/
// Intellect as a damage stat). A physical basic attack (Strength/Agility)
// and a magic one (Intellect) draw from separate Crit/Haste pools - see
// docs/stats.md.
func unitCombatStats(unit *instancestate.UnitState, zone instanceconfig.Zone) (hastePct, critChancePct, statDPS float64) {
	strength, agility, intellect, _, stats := unitEffectiveStats(unit, zone)

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
		hastePct = (stats["haste_rating"] + intellect*magicHasteRatingPerIntellect) / 11.71
		critChancePct = 5 + (stats["crit_rating"]+intellect*magicCritRatingPerIntellect)/15
		statDPS = intellect / basicAttackStatDPSDivisor
	default:
		hastePct = stats["haste_rating"] / 11.71
		critChancePct = 5 + stats["crit_rating"]/15
	}
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

	versatility := stats["versatility_rating"]
	strength = stats["strength"] + versatility*versatilityStatWeight
	agility = stats["agility"] + versatility*versatilityStatWeight
	intellect = stats["intellect"] + versatility*versatilityStatWeight
	defenceRating = stats["defence_rating"] + versatility*versatilityStatWeight
	return strength, agility, intellect, defenceRating, stats
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

	var effectiveAvoidanceStat float64
	if physical {
		effectiveAvoidanceStat = strength + agility*agilityPhysicalAvoidanceWeight
	} else {
		effectiveAvoidanceStat = intellect + agility*agilityMagicAvoidanceWeight
	}
	avoidance := avoidanceAsymptote * effectiveAvoidanceStat / (effectiveAvoidanceStat + avoidanceHalfPoint)
	if rand.Float64() < avoidance {
		return 0
	}

	drAsymptote := physicalDRAsymptote
	if !physical {
		drAsymptote = magicDRAsymptote
	}
	dr := drAsymptote * defenceRating / (defenceRating + defenceRatingHalfPoint)
	return rawDamage * (1 - dr)
}

// basicAttackDamage rolls one swing's outcome - miss, normal hit, or crit -
// and returns the damage dealt (0 on a miss). See docs/stats.md's "Basic
// Attack DPS" section: nominalSwingDamage is what DPS*nominalInterval would
// deal every swing before the miss/crit/variance rolls are applied. A
// landed hit varies uniformly within +/-10% of that nominal value, so
// swings aren't all identical even absent a crit.
func basicAttackDamage(critChancePct, statDPS float64) float64 {
	if rand.Float64() < characterBasicAttackMissChance {
		return 0
	}
	nominalSwingDamage := (characterBasicAttackBaseDPS + statDPS) * characterBasicAttackNominalInterval.Seconds()
	variance := 1 + (rand.Float64()*2-1)*characterBasicAttackVariance
	multiplier := 1.0
	if rand.Float64() < critChancePct/100 {
		multiplier = characterBasicAttackCritMultiplier
	}
	return math.Round(nominalSwingDamage * variance * multiplier)
}
