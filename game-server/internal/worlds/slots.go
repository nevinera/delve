package worlds

// Object slots (client/src/v2/slots.js): places in a tile where something could stand, scattered
// the same every time from a seed. A slot is x and z in feet across the tile, a size (an index into
// slotSizes) and a roll.

const (
	slotBytes = 4
	slotSeed  = 0x736c6f74
)

var slotSizes = []string{"small", "medium", "large"}

// slotGrids are each size's slots, largest first: one in each square `every` ft wide.
var slotGrids = []struct{ size, every int }{{2, 32}, {1, 16}, {0, 16}}

// hash2 is a number from 0 to 1 for (ix, iz) and a seed (client/src/world/noise.js hash2).
func hash2(ix, iz int, seed int) float64 {
	h := uint32(int32(ix))*0x27d4eb2d ^ uint32(int32(iz))*0x165667b1 ^ uint32(int32(seed))
	h = (h ^ h>>15) * 0x85ebca6b
	h = (h ^ h>>13) * 0xc2b2ae35
	h ^= h >> 16
	return float64(h) / 4294967296
}

// makeSlots is tile (tx, tz)'s slots.
func makeSlots(tx, tz int) []byte {
	var slots []byte
	for _, g := range slotGrids {
		n := int(TileFt) / g.every
		seed := slotSeed + g.size*4
		for j := 0; j < n; j++ {
			for i := 0; i < n; i++ {
				ci, cj := tx*n+i, tz*n+j
				slots = append(slots,
					byte(i*g.every+int(hash2(ci, cj, seed)*float64(g.every))),
					byte(j*g.every+int(hash2(ci, cj, seed+1)*float64(g.every))),
					byte(g.size),
					byte(int(hash2(ci, cj, seed+2)*256)))
			}
		}
	}
	return slots
}
