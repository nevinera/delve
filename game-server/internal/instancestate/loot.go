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
	pending := rollLoot(unit.LootTable, unit.LootCount, state.Items)
	if len(pending) == 0 {
		return
	}
	unit.LootItems = pending
	rawItems := make([]instanceconfig.Item, len(pending))
	for i, p := range pending {
		rawItems[i] = p.Item
	}
	state.PendingLootEvents = append(state.PendingLootEvents, LootEvent{
		UnitUUID: unitID,
		UnitID:   unitID.String(),
		Items:    rawItems,
	})
}

func rollLoot(table map[string]int, count [2]float64, catalog map[string]instanceconfig.Item) []PendingLootItem {
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

	n := resolveLootCount(count)

	var result []PendingLootItem
	for range n {
		r := rand.Intn(total)
		for _, e := range entries {
			if r < e.cumul {
				if item, ok := catalog[e.id]; ok {
					result = append(result, PendingLootItem{
						ClaimID: uuid.New(),
						Item:    item,
					})
				}
				break
			}
		}
	}
	return result
}

// resolveLootCount turns a [min, max] lootCount range into a concrete item
// count for one kill. A resolved value >= 1 awards that many items
// (truncated to an integer); a resolved value in [0, 1) is instead the
// probability of awarding exactly one item (0 otherwise) - this lets a unit
// be configured to drop its loot only some of the time.
func resolveLootCount(count [2]float64) int {
	value := count[0]
	if count[1] > count[0] {
		value = count[0] + rand.Float64()*(count[1]-count[0])
	}
	if value < 1 {
		if rand.Float64() < value {
			return 1
		}
		return 0
	}
	return int(value)
}
