package instancestate

import (
	"math/rand"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// RollAndRecordLoot samples items from the dead unit's loot table and appends
// a LootEvent to state.PendingLootEvents. No-ops if the unit has no loot table.
func RollAndRecordLoot(unitID uuid.UUID, unit *UnitState, state *InstanceState) {
	if len(unit.LootTable) == 0 || len(state.Items) == 0 {
		return
	}
	items := rollLoot(unit.LootTable, unit.LootCount, state.Items)
	if len(items) == 0 {
		return
	}
	unit.LootItems = items
	state.PendingLootEvents = append(state.PendingLootEvents, LootEvent{
		UnitID: unitID.String(),
		Items:  items,
	})
}

func rollLoot(table map[string]int, count [2]int, catalog map[string]instanceconfig.Item) []instanceconfig.Item {
	type entry struct {
		id    string
		cumul int
	}
	entries := make([]entry, 0, len(table))
	total := 0
	for id, w := range table {
		if w > 0 {
			total += w
			entries = append(entries, entry{id, total})
		}
	}
	if total == 0 {
		return nil
	}

	n := count[0]
	if count[1] > count[0] {
		n = count[0] + rand.Intn(count[1]-count[0]+1)
	}

	var result []instanceconfig.Item
	for range n {
		r := rand.Intn(total)
		for _, e := range entries {
			if r < e.cumul {
				if item, ok := catalog[e.id]; ok {
					result = append(result, item)
				}
				break
			}
		}
	}
	return result
}
