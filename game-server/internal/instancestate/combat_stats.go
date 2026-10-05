package instancestate

// SchoolCombatStats is what a unit brings to one school of combat: Haste and
// Crit as percentages, and the primary stat (already including Versatility's
// spread and status buffs) that drives that school's damage/healing bonus.
type SchoolCombatStats struct {
	HastePct         float64
	CritChancePct    float64
	StatContribution float64
}

// CombatStats is a unit's derived combat numbers - see docs/stats.md.
// Stats holds the effective totals (gear scaled to the unit's map, status
// modifiers and the Versatility spread applied) keyed by the snake_case
// names itemized gear uses.
type CombatStats struct {
	Stats map[string]float64

	// Physical and Magic are the per-school figures power effects and
	// recurring ticks use.
	Physical SchoolCombatStats
	Magic    SchoolCombatStats

	// BasicAttack is the school-of-the-damage-stat figure basic attacks use;
	// its StatContribution is the raw stat, not yet divided into DPS.
	BasicAttack SchoolCombatStats

	// Elvl is the unit's elevation (docs/stats.md): a player's weighted mean
	// gear elvl (itemstats.GearElvl), or an NPC's map elvl.
	Elvl float64
}
