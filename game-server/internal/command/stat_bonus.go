package command

import "github.com/delve-mmo/game-server/internal/instancestate"

// StatModifiers is the combined bonus every currently-active "stat"
// StatusEffect grants a unit, aggregated in one pass by ActiveStatModifiers
// rather than rescanned per stat name - a single unit's combat math queries
// a dozen-plus stat names per calculation (Tier 1 alone is 9), and each of
// those would otherwise rescan the same ActiveStatusEffects list.
type StatModifiers struct {
	add      map[string]float64
	multiply map[string]float64 // absent key means 1 (identity), not 0
}

// ActiveStatModifiers does one pass over unit's active statuses, summing
// every "stat" sub-effect by StatName - every "add" amount summed, every
// "multiply" amount multiplied together (two +10% buffs compound to 1.21,
// not 1.2, matching how percentage buffs normally stack elsewhere in this
// engine). A sub-effect whose ConditionsMet entry is false (its
// StatusEffectCondition currently doesn't hold - see ConditionMet) is
// skipped, same as if it weren't present at all.
func ActiveStatModifiers(unit *instancestate.UnitState) StatModifiers {
	m := StatModifiers{add: map[string]float64{}, multiply: map[string]float64{}}
	for _, e := range unit.ActiveStatusEffects {
		for i, eff := range e.Status.Effects {
			if eff.Type != "stat" {
				continue
			}
			if i < len(e.ConditionsMet) && !e.ConditionsMet[i] {
				continue
			}
			switch eff.ModifierType {
			case "add":
				m.add[eff.StatName] += eff.Amount
			case "multiply":
				if _, ok := m.multiply[eff.StatName]; !ok {
					m.multiply[eff.StatName] = 1
				}
				m.multiply[eff.StatName] *= eff.Amount
			}
		}
	}
	return m
}

// Get returns statName's combined bonus - callers always compute
// (base + add) * multiply unconditionally; multiply is 1 (a no-op) if
// nothing currently modifies that stat.
func (m StatModifiers) Get(statName string) (add, multiply float64) {
	multiply = 1
	if v, ok := m.multiply[statName]; ok {
		multiply = v
	}
	return m.add[statName], multiply
}

// applyTier2SchoolPct folds status-effect bonuses for a school-scoped Tier 2
// percentage stat (docs/schema/status.md's physicalHaste/magicHaste,
// physicalCritChance/magicCritChance) into pct - statName is school+kind,
// e.g. school "physical" + kind "Haste" -> "physicalHaste".
func applyTier2SchoolPct(mods StatModifiers, school, kind string, pct float64) float64 {
	add, multiply := mods.Get(school + kind)
	return (pct + add) * multiply
}

// applySchoolStatBonus folds both a general stat name's bonus and a
// school-scoped variant's bonus into value in one step (docs/schema/
// status.md's damageDone/physicalDamageDone/magicDamageDone,
// damageTaken/physicalDamageTaken/magicDamageTaken) - both add terms sum
// in, both multiply terms multiply in, so e.g. a general +10% damageDone
// buff and a physical-only +10% physicalDamageDone buff both apply
// together against a physical hit.
func applySchoolStatBonus(mods StatModifiers, generalName, schoolName string, value float64) float64 {
	addGeneral, multiplyGeneral := mods.Get(generalName)
	addSchool, multiplySchool := mods.Get(schoolName)
	return (value + addGeneral + addSchool) * multiplyGeneral * multiplySchool
}

// ApplyDamageDoneBonus folds unit's "damageDone" stat-effect bonus (plus the
// school-scoped physicalDamageDone/magicDamageDone variant) into raw - the
// caster-side counterpart to IncomingDamage's defender-side damageTaken
// handling. Exported since basic-attack damage is computed in both this
// package (players) and internal/instance (NPCs) - effectAmount (power
// effects, shared by both players and NPCs) uses the unexported
// applySchoolStatBonus directly instead, being in this package already.
func ApplyDamageDoneBonus(unit *instancestate.UnitState, physical bool, raw float64) float64 {
	school := "physical"
	if !physical {
		school = "magic"
	}
	return applySchoolStatBonus(ActiveStatModifiers(unit), "damageDone", school+"DamageDone", raw)
}
