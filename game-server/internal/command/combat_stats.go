package command

import (
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
	"github.com/delve-mmo/game-server/internal/itemstats"
)

// ComputeCombatStats derives unit's full set of combat numbers from its
// gear, active statuses and current map. It's pure: the instance tick calls
// it once per unit at the start of each tick and stores the result on
// unit.CombatStats.
func ComputeCombatStats(unit *instancestate.UnitState, zone instanceconfig.Zone) *instancestate.CombatStats {
	strength, agility, intellect, defenceRating, base := computeUnitEffectiveStats(unit, zone)

	stats := make(map[string]float64, len(base))
	for k, v := range base {
		stats[k] = v
	}
	stats["strength"] = strength
	stats["agility"] = agility
	stats["intellect"] = intellect
	stats["defence_rating"] = defenceRating

	physical := schoolCombatStats(unit, zone, "physical")
	magic := schoolCombatStats(unit, zone, "magic")

	basicHaste, basicCrit, basicStatDPS := computeUnitCombatStats(unit, zone)

	return &instancestate.CombatStats{
		Stats:    stats,
		Physical: physical,
		Magic:    magic,
		BasicAttack: instancestate.SchoolCombatStats{
			HastePct:         basicHaste,
			CritChancePct:    basicCrit,
			StatContribution: basicStatDPS * basicAttackStatDPSDivisor,
		},
		Elvl: unitElvl(unit, zone),
	}
}

// unitElvl is a player's weighted mean gear elvl, or an NPC's map elvl
// (docs/stats.md: a monster's elevation is its map's).
func unitElvl(unit *instancestate.UnitState, zone instanceconfig.Zone) float64 {
	if unit.Hostility != "" {
		return zone.MapElvl(unit.MapIdentifier)
	}
	pieces := make(map[string]itemstats.GearPiece, len(unit.EquippedItems))
	for slot, item := range unit.EquippedItems {
		pieces[slot] = itemstats.GearPiece{Slot: item.Slot, Elvl: item.Elvl}
	}
	return itemstats.GearElvl(pieces)
}

func schoolCombatStats(unit *instancestate.UnitState, zone instanceconfig.Zone, school string) instancestate.SchoolCombatStats {
	haste, crit, contribution := computeEffectSchoolStats(unit, zone, school)
	return instancestate.SchoolCombatStats{HastePct: haste, CritChancePct: crit, StatContribution: contribution}
}
