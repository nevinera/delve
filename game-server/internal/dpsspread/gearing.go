package dpsspread

import (
	"github.com/delve-mmo/game-server/internal/dpssim"
	"github.com/delve-mmo/game-server/internal/itemstats"
)

// GearingPlan names one of the mocked-up target archetypes Spread runs an
// enemy against.
type GearingPlan string

const (
	GearingOffense GearingPlan = "offense"            // pure damage-secondary itemization
	GearingHybrid  GearingPlan = "offenseWithDefense" // damage primary, secondaries split offense/defense
	GearingDefense GearingPlan = "defense"            // full tank itemization, shield equipped
)

// Plans is every GearingPlan Spread runs, in a fixed, stable order.
var Plans = []GearingPlan{GearingOffense, GearingHybrid, GearingDefense}

// Elevations is every relative elevation (ee = item elvl - map elvl)
// Spread runs, in a fixed, stable order - the three combat_balance.md
// scopes this pass across (see that doc's "Elevation" open question).
var Elevations = []float64{-10, -5, 0}

// Mirrors internal/command/basic_attack_handler.go's same-named constants.
const (
	versatilityStatWeight = 0.2
	playerBaseMaxHealth   = 100.0
	maxHealthPerStamina   = 10.0
)

// slotSpec is the subset of docs/stats.md's "Slots" table this package
// needs to mock up a fully-itemized kit: which slots take a primary stat,
// and how many secondary slots each has. Mirrors itemstats' own (private)
// slotShapes table's shape, not its stat-point factors - those are
// itemstats.Raw's job once given a real Allocation.
type slotSpec struct {
	name        string
	hasPrimary  bool
	secondaries int
}

var slots = []slotSpec{
	{"head", true, 3},
	{"neck", false, 3},
	{"shoulders", true, 2},
	{"back", true, 2},
	{"chest", true, 3},
	{"wrists", true, 2},
	{"hands", true, 2},
	{"waist", true, 2},
	{"legs", true, 3},
	{"feet", true, 2},
	{"ring", false, 2},
	{"ring", false, 2},
	{"main_hand", true, 3},
	{"off_hand", true, 3}, // becomes a shield (no primary) for GearingDefense - see allocationsFor
}

// offensiveDamageStat is the representative primary stat for offense/hybrid
// gear - Agility, since it's the one damage stat that contributes to both
// physical and magic Avoidance (0.66/0.33, see docs/stats.md), rather than
// being maximally strong against one of the enemy's attack schools and
// inert against the other.
const offensiveDamageStat = "agility"

// alternate fills an n-long secondary list by cycling through options -
// used so every gearing plan's items are "fully itemized" (no slot left
// short, which would otherwise trigger itemstats.Raw's missing-secondary
// redistribution bonus and skew the numbers).
func alternate(n int, options ...string) []string {
	out := make([]string, n)
	for i := range out {
		out[i] = options[i%len(options)]
	}
	return out
}

// secondariesFor returns plan's n-long secondary stat list for a slot.
func secondariesFor(plan GearingPlan, n int) []string {
	switch plan {
	case GearingDefense:
		return alternate(n, "defence_rating", "versatility_rating")
	case GearingHybrid:
		return alternate(n, "crit_rating", "defence_rating", "haste_rating", "versatility_rating")
	default: // GearingOffense
		return alternate(n, "crit_rating", "haste_rating")
	}
}

// allocationsFor mocks up plan's full 14-item kit as itemstats.Allocations,
// at em=1.0 (Elvl doesn't matter here - see the package doc's note on
// applying elevation uniformly afterward instead of per-item).
func allocationsFor(plan GearingPlan) []itemstats.Allocation {
	primaryStat := offensiveDamageStat
	if plan == GearingDefense {
		primaryStat = "defence_rating"
	}

	allocations := make([]itemstats.Allocation, 0, len(slots))
	for _, s := range slots {
		if s.name == "off_hand" && plan == GearingDefense {
			allocations = append(allocations, itemstats.Allocation{
				Slot:        "off_hand",
				Shield:      true,
				Secondaries: secondariesFor(plan, s.secondaries),
			})
			continue
		}

		a := itemstats.Allocation{Slot: s.name, Secondaries: secondariesFor(plan, s.secondaries)}
		if s.hasPrimary {
			p := primaryStat
			a.Primary = &p
		}
		allocations = append(allocations, a)
	}
	return allocations
}

// rawStatsFor sums itemstats.Raw across plan's whole mocked kit.
func rawStatsFor(plan GearingPlan) map[string]float64 {
	total := make(map[string]float64)
	for _, a := range allocationsFor(plan) {
		for stat, value := range itemstats.Raw(a) {
			total[stat] += value
		}
	}
	return total
}

// targetStatsFromRaw scales raw kit totals to ee, then applies the same
// Versatility-spread and Stamina->MaxHealth conversion
// command.unitEffectiveStats/PlayerMaxHealth apply to a real character -
// see this file's mirrored constants.
func targetStatsFromRaw(raw map[string]float64, ee float64) dpssim.TargetStats {
	scaled := itemstats.Scaled(raw, ee)
	versatility := scaled["versatility_rating"]
	return dpssim.TargetStats{
		Strength:      scaled["strength"] + versatility*versatilityStatWeight,
		Agility:       scaled["agility"] + versatility*versatilityStatWeight,
		Intellect:     scaled["intellect"] + versatility*versatilityStatWeight,
		DefenceRating: scaled["defence_rating"] + versatility*versatilityStatWeight,
		MaxHealth:     playerBaseMaxHealth + scaled["stamina"]*maxHealthPerStamina,
	}
}

// TargetStatsForPlan mocks up plan's kit and resolves it to final
// TargetStats at relative elevation ee - exported so callers (tests, a
// future CLI) can inspect one cell's target stats without running a full
// simulation.
func TargetStatsForPlan(plan GearingPlan, ee float64) dpssim.TargetStats {
	return targetStatsFromRaw(rawStatsFor(plan), ee)
}
