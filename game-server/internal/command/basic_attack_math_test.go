package command

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// Internal-package tests for unitCombatStats and basicAttackDamage - the
// pure (non-random) combat math, and the miss/crit roll that sits on top of
// it. Kept separate from basic_attack_handler_test.go (package
// command_test) since these exercise unexported helpers directly.

func strPtr(s string) *string { return &s }

// fullyItemizedMainHand returns a main_hand item (factor 2.0) with the given
// primary and every secondary slot filled (so no missing-secondary
// redistribution bonus applies) - raw primary 30, raw stamina/crit_rating/
// haste_rating 20 each. See itemstats.Raw and docs/stats.md's "Slots" table.
func fullyItemizedMainHand(primary string, elvl int) instanceconfig.EquippedItem {
	return instanceconfig.EquippedItem{
		Slot:           "main_hand",
		Elvl:           elvl,
		PrimaryStat:    strPtr(primary),
		SecondaryStats: []string{"stamina", "crit_rating", "haste_rating"},
	}
}

func TestUnitCombatStats_NakedUnitHasBaseCritOnlyAndNoStatDPS(t *testing.T) {
	unit := &instancestate.UnitState{}
	hastePct, critChancePct, statDPS := unitCombatStats(unit, instanceconfig.Zone{})
	assert.Equal(t, 0.0, hastePct)
	assert.Equal(t, 5.0, critChancePct)
	assert.Equal(t, 0.0, statDPS)
}

func TestUnitCombatStats_StrengthFeedsStatDPSOnlyWhenItIsTheDamageStat(t *testing.T) {
	unit := &instancestate.UnitState{
		DamageStatKey: "strength",
		EquippedItems: map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("strength", 0)},
	}
	_, _, statDPS := unitCombatStats(unit, instanceconfig.Zone{})
	assert.InDelta(t, 30.0/90, statDPS, 0.001)

	unit.DamageStatKey = "agility"
	_, _, statDPS = unitCombatStats(unit, instanceconfig.Zone{})
	assert.Equal(t, 0.0, statDPS, "strength is itemized, but agility is this class's damage stat")
}

func TestUnitCombatStats_VersatilitySpreadsIntoTheDamageStat(t *testing.T) {
	unit := &instancestate.UnitState{
		DamageStatKey: "strength",
		EquippedItems: map[string]instanceconfig.EquippedItem{
			"ring_1": {Slot: "ring", SecondaryStats: []string{"versatility_rating", "versatility_rating"}},
		},
	}
	_, _, statDPS := unitCombatStats(unit, instanceconfig.Zone{})
	// ring factor 1.0, both secondary slots filled -> raw versatility_rating
	// 20; 0.2x of that spreads +4 into strength.
	assert.InDelta(t, 4.0/90, statDPS, 0.001)
}

func TestUnitCombatStats_StrengthAlwaysFeedsPhysicalCritRegardlessOfDamageStat(t *testing.T) {
	unit := &instancestate.UnitState{
		DamageStatKey: "agility", // not strength - crit still gets strength's contribution
		EquippedItems: map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("strength", 0)},
	}
	_, critChancePct, statDPS := unitCombatStats(unit, instanceconfig.Zone{})
	assert.Equal(t, 0.0, statDPS, "strength isn't the damage stat here")
	// raw strength 30 -> +18 effective crit rating; raw crit_rating 20 itemized
	// directly too -> effectiveCritRating 38 -> 5 + 38/15
	assert.InDelta(t, 5+38.0/15, critChancePct, 0.001)
}

func TestUnitCombatStats_AgilityAlwaysFeedsPhysicalHasteRegardlessOfDamageStat(t *testing.T) {
	unit := &instancestate.UnitState{
		DamageStatKey: "strength", // not agility - haste still gets agility's contribution
		EquippedItems: map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("agility", 0)},
	}
	hastePct, _, statDPS := unitCombatStats(unit, instanceconfig.Zone{})
	assert.Equal(t, 0.0, statDPS, "agility isn't the damage stat here")
	// raw agility 30 -> +18 effective haste rating; raw haste_rating 20
	// itemized directly too -> effectiveHasteRating 38 -> 38/11.71
	assert.InDelta(t, 38.0/11.71, hastePct, 0.001)
}

func TestUnitCombatStats_IntellectFeedsStatDPSAndItsOwnMagicCritAndHaste(t *testing.T) {
	unit := &instancestate.UnitState{
		DamageStatKey: "intellect",
		EquippedItems: map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("intellect", 0)},
	}
	hastePct, critChancePct, statDPS := unitCombatStats(unit, instanceconfig.Zone{})
	// raw intellect 30 -> +9 magic crit, +9 magic haste (0.3x each); raw
	// crit_rating/haste_rating 20 itemized directly too.
	assert.InDelta(t, 30.0/90, statDPS, 0.001)
	assert.InDelta(t, 5+29.0/15, critChancePct, 0.001)
	assert.InDelta(t, 29.0/11.71, hastePct, 0.001)
}

func TestUnitCombatStats_StrengthDoesNotFeedMagicCritForAnIntellectCharacter(t *testing.T) {
	unit := &instancestate.UnitState{
		DamageStatKey: "intellect",
		EquippedItems: map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("strength", 0)},
	}
	_, critChancePct, statDPS := unitCombatStats(unit, instanceconfig.Zone{})
	assert.Equal(t, 0.0, statDPS)
	// only itemized crit_rating (20) applies - strength's physical bonus doesn't.
	assert.InDelta(t, 5+20.0/15, critChancePct, 0.001)
}

func TestUnitCombatStats_HasteRatingIncreasesHastePct(t *testing.T) {
	unit := &instancestate.UnitState{
		EquippedItems: map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("strength", 0)},
	}
	hastePct, _, _ := unitCombatStats(unit, instanceconfig.Zone{})
	assert.InDelta(t, 20.0/11.71, hastePct, 0.001)
}

func TestUnitCombatStats_ElevationScalesEachItemAgainstTheCurrentMap(t *testing.T) {
	unit := &instancestate.UnitState{
		DamageStatKey: "strength",
		MapIdentifier: "m",
		EquippedItems: map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("strength", -20)},
	}
	zone := instanceconfig.Zone{Elvl: 0, Maps: []instanceconfig.Map{{Identifier: "m"}}}

	hastePct, critChancePct, statDPS := unitCombatStats(unit, zone)
	// ee = -20 - 0 = -20 -> em = 0, zeroing every stat this item grants
	assert.Equal(t, 0.0, hastePct)
	assert.Equal(t, 5.0, critChancePct)
	assert.Equal(t, 0.0, statDPS)
}

func TestUnitCombatStats_MapElvlOverrideIsUsedOverZoneElvl(t *testing.T) {
	mapElvl := -20
	unit := &instancestate.UnitState{
		DamageStatKey: "strength",
		MapIdentifier: "m",
		EquippedItems: map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("strength", 0)},
	}
	zone := instanceconfig.Zone{Elvl: 0, Maps: []instanceconfig.Map{{Identifier: "m", Elvl: &mapElvl}}}

	_, _, statDPS := unitCombatStats(unit, zone)
	// item elvl 0 vs the map's overridden elvl -20 -> ee = 20 -> em = 2.0
	assert.InDelta(t, (30.0*2.0)/90, statDPS, 0.001)
}

func TestIncomingDamage_NakedTargetTakesFullDamage(t *testing.T) {
	target := &instancestate.UnitState{}
	assert.Equal(t, 100.0, IncomingDamage(target, instanceconfig.Zone{}, 100, true))
	assert.Equal(t, 100.0, IncomingDamage(target, instanceconfig.Zone{}, 100, false))
}

func TestIncomingDamage_DefenceRatingReducesWhatAvoidanceDoesNotFullyAvoid(t *testing.T) {
	// Defence Rating alone (no Strength/Agility/Intellect), so Avoidance is 0
	// and every trial lands - only DR's reduction is exercised.
	target := &instancestate.UnitState{
		EquippedItems: map[string]instanceconfig.EquippedItem{
			"neck": {Slot: "neck", SecondaryStats: []string{"defence_rating", "defence_rating", "defence_rating"}},
		},
	}
	// neck has no primary slot and all 3 secondary slots filled (factor 1.0),
	// so no missing-secondary bonus applies: raw defence_rating = 3*10 = 30.
	const r = 30.0
	expectedPhysical := 100 * (1 - physicalDRAsymptote*r/(r+defenceRatingHalfPoint))
	expectedMagic := 100 * (1 - magicDRAsymptote*r/(r+defenceRatingHalfPoint))
	assert.InDelta(t, expectedPhysical, IncomingDamage(target, instanceconfig.Zone{}, 100, true), 0.001)
	assert.InDelta(t, expectedMagic, IncomingDamage(target, instanceconfig.Zone{}, 100, false), 0.001)
}

func TestIncomingDamage_StrengthGrantsOnlyPhysicalAvoidance(t *testing.T) {
	target := &instancestate.UnitState{EquippedItems: map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("strength", 0)}}
	// raw strength 30 -> avoidance stat 30 -> avoidance = 0.6*30/280 ~= 6.4%,
	// high enough that a few hundred trials reliably see at least one avoid,
	// and low enough that magic (0 avoidance, no DR either since no
	// defence_rating itemized) should never be avoided.
	var physicalAvoided, magicAvoided int
	for i := 0; i < 500; i++ {
		if IncomingDamage(target, instanceconfig.Zone{}, 100, true) == 0 {
			physicalAvoided++
		}
		if IncomingDamage(target, instanceconfig.Zone{}, 100, false) == 0 {
			magicAvoided++
		}
	}
	assert.Greater(t, physicalAvoided, 0, "strength should grant some physical avoidance")
	assert.Equal(t, 0, magicAvoided, "strength grants no magic avoidance")
}

func TestBasicAttackDamage_NeverNegative(t *testing.T) {
	for i := 0; i < 1000; i++ {
		assert.GreaterOrEqual(t, basicAttackDamage(50, 10), 0.0)
	}
}

func TestBasicAttackDamage_NonCritHitsVaryWithinPlusOrMinus10PercentOfNominal(t *testing.T) {
	// 0 crit chance and 0 statDPS isolates the variance roll: nominal
	// pre-crit damage is (1 + 0) * 2s = 2, so every landed swing should fall
	// in round([1.8, 2.2]) = {2}... use a larger statDPS so the +/-10% band
	// is wide enough to actually observe more than one rounded value.
	const statDPS = 40.0 // nominal = (1+40)*2 = 82, +/-10% = [73.8, 90.2]
	seen := map[float64]bool{}
	for i := 0; i < 2000; i++ {
		d := basicAttackDamage(0, statDPS)
		if d == 0 {
			continue // miss
		}
		require.GreaterOrEqual(t, d, 73.0)
		require.LessOrEqual(t, d, 91.0)
		seen[d] = true
	}
	assert.Greater(t, len(seen), 5, "expected a spread of distinct damage values from the +/-10% variance roll")
}

func TestBasicAttackDamage_MissesAtTheDocumentedRateAndAveragesToTheExpectedDPS(t *testing.T) {
	const trials = 20000
	const statDPS = 4.0
	const critChancePct = 10.0

	var total float64
	var missCount int
	for i := 0; i < trials; i++ {
		d := basicAttackDamage(critChancePct, statDPS)
		if d == 0 {
			missCount++
		}
		total += d
	}

	missRate := float64(missCount) / trials
	assert.InDelta(t, characterBasicAttackMissChance, missRate, 0.02)

	nominalSwingDamage := (characterBasicAttackBaseDPS + statDPS) * characterBasicAttackNominalInterval.Seconds()
	expectedAvg := nominalSwingDamage * (1 - characterBasicAttackMissChance) * (1 + critChancePct/100*(characterBasicAttackCritMultiplier-1))
	observedAvg := total / trials
	assert.InDelta(t, expectedAvg, observedAvg, expectedAvg*0.05)
}
