package itemstats

// EquippedSlots are the character's equip slots, in sheet order.
var EquippedSlots = []string{
	"head", "neck", "shoulders", "back", "chest", "wrists",
	"hands", "waist", "legs", "feet", "ring_1", "ring_2",
	"main_hand", "off_hand",
}

// GearPiece is what GearElvl needs of an equipped item: its own item slot
// (for its weight) and its elvl.
type GearPiece struct {
	Slot string
	Elvl int
}

// GearElvl is a character's weighted mean gear elevation (docs/stats.md's
// "Item coloration"): every equip slot's elvl, weighted by its slot factor,
// so a two-hander pulls the mean more than a ring. Empty slots count as elvl
// 0, weighted by the equip slot itself (an empty main_hand weighs 2, though a
// two-hander there would weigh 4). Matches the client's gearElevation.
// pieces is keyed by equip slot (ring_1, main_hand, ...).
func GearElvl(pieces map[string]GearPiece) float64 {
	var sum, total float64
	for _, equipped := range EquippedSlots {
		weight := slotWeight(equipped)
		elvl := 0
		if piece, ok := pieces[equipped]; ok {
			if shape, known := slotShapes[piece.Slot]; known {
				weight = shape.factor
			}
			elvl = piece.Elvl
		}
		sum += float64(elvl) * weight
		total += weight
	}
	return sum / total
}

func slotWeight(equipped string) float64 {
	if equipped == "ring_1" || equipped == "ring_2" {
		equipped = "ring"
	}
	if shape, ok := slotShapes[equipped]; ok {
		return shape.factor
	}
	return 1
}
