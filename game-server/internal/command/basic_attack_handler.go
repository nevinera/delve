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

	// strengthDPSDivisor/agilityDPSDivisor - see docs/stats.md's Strength/
	// Agility sections. Rebalanced 10x weaker than the original /7, /14:
	// level-appropriate gear was multiplying DPS ~40x over a naked
	// character's baseline, versus a target of roughly 3-4x (mirroring the
	// pace of a WoW-style basic-attack fight, not this game's original,
	// much punchier scaling).
	strengthDPSDivisor = 70.0
	agilityDPSDivisor  = 140.0
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
	target.Health -= basicAttackDamage(critChancePct, statDPS)
	if target.Health < 0 {
		target.Health = 0
	}
	if target.Health == 0 {
		target.Status = instancestate.UnitStatusDead
		target.Target = nil
		instancestate.RollAndRecordLoot(*unit.Target, target, next)
		aggroLinkedGroupOnKill(target.ZoneUnitIdentifier, unitID, zone, next)
		unit.Target = nil
		unit.Attacking = false
	}
	return nil
}

// unitCombatStats scales the unit's equipped items against its current map's
// elevation (see instanceconfig.Zone.MapElvl) and derives the totals basic
// attacks need: Haste%, physical Crit Chance%, and the class damage stat's
// DPS contribution (0 for NPCs and for a class with neither Strength nor
// Agility as a damage stat). See docs/stats.md.
func unitCombatStats(unit *instancestate.UnitState, zone instanceconfig.Zone) (hastePct, critChancePct, statDPS float64) {
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
	stats := itemstats.ScaledSum(allocations, zone.MapElvl(unit.MapIdentifier))

	// Versatility Rating spreads 0.2x itself into Strength/Agility (among
	// other stats not relevant to a basic attack) - see docs/stats.md.
	versatility := stats["versatility_rating"]
	strength := stats["strength"] + versatility*0.2
	agility := stats["agility"] + versatility*0.2

	hastePct = stats["haste_rating"] / 11.71
	// Agility always grants physical crit, regardless of class - see docs/stats.md.
	effectiveCritRating := stats["crit_rating"] + agility*0.6
	critChancePct = 5 + effectiveCritRating/15

	switch unit.DamageStatKey {
	case "strength":
		statDPS = strength / strengthDPSDivisor
	case "agility":
		statDPS = agility / agilityDPSDivisor
	}
	return hastePct, critChancePct, statDPS
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
