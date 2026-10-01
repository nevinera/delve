package instance

import (
	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

// queueDespawn records a removed slot's character unit for removal at the
// start of the next tick. Slots are removed from outside the tick loop (the
// DELETE endpoint) as well as inside it (pruning), but only the tick loop
// may touch InstanceState, so removal always goes through this queue.
func (inst *Instance) queueDespawn(unitID uuid.UUID) {
	inst.despawnMu.Lock()
	defer inst.despawnMu.Unlock()
	inst.pendingDespawns = append(inst.pendingDespawns, unitID)
}

// drainPlayerDespawns removes every queued character unit from state. Runs
// after drainPlayerSpawns, so a slot removed before its queued spawn was
// processed still ends up with no unit.
func (inst *Instance) drainPlayerDespawns(state *instancestate.InstanceState) {
	inst.despawnMu.Lock()
	pending := inst.pendingDespawns
	inst.pendingDespawns = nil
	inst.despawnMu.Unlock()
	for _, unitID := range pending {
		removeUnit(state, unitID)
	}
}

// removeUnit deletes a unit from state and clears every reference other
// units hold to it: an NPC targeting it drops the target (and so leashes,
// like any lost target), a cast aimed at it is cancelled, its tag on a mob
// is cleared, and its per-character loot claims are dropped. Statuses it
// applied stay on their targets; their ticks already skip a missing
// applier (see fireStatusTick).
func removeUnit(state *instancestate.InstanceState, unitID uuid.UUID) {
	if _, ok := state.Units[unitID]; !ok {
		return
	}
	delete(state.Units, unitID)
	for _, u := range state.Units {
		if u.Target != nil && *u.Target == unitID {
			u.Target = nil
			u.Attacking = false
		}
		if u.TaggedBy != nil && *u.TaggedBy == unitID {
			u.TaggedBy = nil
		}
		if u.Casting != nil && u.Casting.TargetID != nil && *u.Casting.TargetID == unitID {
			u.Casting = nil
		}
		for i := range u.LootItems {
			u.LootItems[i].Claims = withoutClaimsBy(u.LootItems[i].Claims, unitID)
		}
	}
}

func withoutClaimsBy(claims []instancestate.CharacterLootClaim, unitID uuid.UUID) []instancestate.CharacterLootClaim {
	kept := claims[:0]
	for _, c := range claims {
		if c.CharacterUnitID != unitID {
			kept = append(kept, c)
		}
	}
	return kept
}
