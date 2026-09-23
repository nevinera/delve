package classdps

import "github.com/delve-mmo/game-server/internal/instanceconfig"

// This file ports app/services/trainee_gear/generate.rb (Ruby) to Go -
// deliberately duplicated rather than shared, since the CLI tools this
// package backs (see plans/character-dps-sim.md step 8) must run standalone
// without a live Rails server. If the two ever drift, a parity test is the
// fix, not collapsing to one implementation - see the plan doc.

// equippedSlots mirrors EquippedItem::EQUIPPED_SLOTS (app/models/equipped_item.rb).
var equippedSlots = []string{
	"head", "neck", "shoulders", "back", "chest", "wrists", "hands", "waist",
	"legs", "feet", "ring_1", "ring_2", "main_hand", "off_hand",
}

// nonWeaponWields mirrors TraineeGear::Generate::NON_WEAPON_WIELDS - wields
// values that aren't actual weapons: no basic attack, no weaponType.
var nonWeaponWields = map[string]bool{"shield": true, "totem": true, "book": true, "orb": true}

// primaryRanks mirrors TraineeGear::Generate::PRIMARY_RANKS - which rank
// (0-indexed into a class's PrimaryStats) each primary-bearing equip slot
// uses, keyed by how many primary stats the class has. A slot missing from
// the inner map (e.g. "neck", "ring_1", "ring_2") carries no primary stat.
var primaryRanks = map[int]map[string]int{
	1: {
		"main_hand": 0, "off_hand": 0, "head": 0, "shoulders": 0, "back": 0,
		"chest": 0, "wrists": 0, "hands": 0, "waist": 0, "legs": 0, "feet": 0,
	},
	2: {
		"main_hand": 0, "off_hand": 0, "head": 0, "shoulders": 1, "back": 0,
		"chest": 1, "wrists": 0, "hands": 1, "waist": 0, "legs": 1, "feet": 0,
	},
	3: {
		"main_hand": 0, "off_hand": 0, "head": 1, "shoulders": 1, "back": 0,
		"chest": 2, "wrists": 1, "hands": 0, "waist": 1, "legs": 0, "feet": 2,
	},
}

// secondaryRanks mirrors TraineeGear::Generate::SECONDARY_RANKS - which
// ranks (0-indexed into a class's SecondaryStats) each equip slot carries.
var secondaryRanks = map[string][]int{
	"head": {0, 1, 2}, "neck": {0, 1, 2}, "shoulders": {1, 3}, "back": {0, 1},
	"chest": {0, 1, 2}, "wrists": {0, 3}, "hands": {0, 4}, "ring_1": {0, 2},
	"ring_2": {1, 3}, "waist": {0, 3}, "legs": {0, 1, 2}, "feet": {0, 4},
	"main_hand": {0, 1, 2}, "off_hand": {0, 1, 2},
}

// itemSlotsOverride mirrors TraineeGear::Generate::ITEM_SLOTS - equipped
// slots whose itemstats.Allocation slot name differs from the equipped slot
// name itself.
var itemSlotsOverride = map[string]string{"ring_1": "ring", "ring_2": "ring"}

func itemSlotFor(equippedSlot string) string {
	if s, ok := itemSlotsOverride[equippedSlot]; ok {
		return s
	}
	return equippedSlot
}

// newTraineeGear mirrors TraineeGear::Generate.call - synthesizes one
// EquippedItem for every equip slot class can fill, from its
// PrimaryStats/SecondaryStats/Wields, all at relative elevation ee (see
// attacker.go/problem-solving note: an empty instanceconfig.Zone{} always
// resolves MapElvl to 0, so setting every item's Elvl to ee directly
// reproduces the desired relative elevation through the normal
// unitEffectiveStats/itemstats.ScaledSum pathway command functions already
// use).
func newTraineeGear(class instanceconfig.CharacterClass, ee int) map[string]instanceconfig.EquippedItem {
	twoHanded := len(class.Wields) == 1

	kit := make(map[string]instanceconfig.EquippedItem, len(equippedSlots))
	for _, equippedSlot := range equippedSlots {
		if equippedSlot == "off_hand" && twoHanded {
			continue
		}
		kit[equippedSlot] = traineeGearItemFor(class, equippedSlot, ee, twoHanded)
	}
	return kit
}

func traineeGearItemFor(class instanceconfig.CharacterClass, equippedSlot string, ee int, twoHanded bool) instanceconfig.EquippedItem {
	if equippedSlot == "main_hand" || equippedSlot == "off_hand" {
		return traineeWeaponItemFor(class, equippedSlot, ee, twoHanded)
	}

	item := instanceconfig.EquippedItem{
		Slot:           itemSlotFor(equippedSlot),
		Elvl:           ee,
		SecondaryStats: secondaryStatsFor(class, equippedSlot),
	}
	if p := primaryStatFor(class, equippedSlot); p != "" {
		item.PrimaryStat = &p
	}
	return item
}

func traineeWeaponItemFor(class instanceconfig.CharacterClass, equippedSlot string, ee int, twoHanded bool) instanceconfig.EquippedItem {
	wield := class.Wields[0]
	if equippedSlot == "off_hand" {
		wield = class.Wields[1]
	}
	shield := wield == "shield"

	item := instanceconfig.EquippedItem{
		Slot:           weaponSlotFor(equippedSlot, twoHanded),
		Elvl:           ee,
		Shield:         shield,
		SecondaryStats: secondaryStatsFor(class, equippedSlot),
	}
	if !shield {
		if p := primaryStatFor(class, equippedSlot); p != "" {
			item.PrimaryStat = &p
		}
	}
	if !nonWeaponWields[wield] {
		w := wield
		item.WeaponType = &w
	}
	return item
}

func weaponSlotFor(equippedSlot string, twoHanded bool) string {
	switch {
	case equippedSlot == "main_hand" && twoHanded:
		return "two_hand"
	case equippedSlot == "off_hand":
		return "off_hand"
	default:
		return "one_hand"
	}
}

func primaryStatFor(class instanceconfig.CharacterClass, equippedSlot string) string {
	ranks, ok := primaryRanks[len(class.PrimaryStats)]
	if !ok {
		return ""
	}
	rank, ok := ranks[equippedSlot]
	if !ok || rank >= len(class.PrimaryStats) {
		return ""
	}
	return class.PrimaryStats[rank]
}

func secondaryStatsFor(class instanceconfig.CharacterClass, equippedSlot string) []string {
	ranks := secondaryRanks[equippedSlot]
	out := make([]string, 0, len(ranks))
	for _, rank := range ranks {
		if rank < len(class.SecondaryStats) {
			out = append(out, class.SecondaryStats[rank])
		}
	}
	return out
}
