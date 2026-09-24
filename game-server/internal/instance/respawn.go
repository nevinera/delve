package instance

import (
	"math/rand"
	"time"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

// respawningWindowMinSeconds/MaxSeconds bound how long a unit spends
// visibly "respawning" - present at its spawn point, but not targetable
// and not yet acting - before it's truly back (issue #69: "should be
// visibly respawning for 2-5 seconds"). Randomized per respawn so several
// units respawning around the same moment don't all snap back in unison.
const (
	respawningWindowMinSeconds = 2.0
	respawningWindowMaxSeconds = 5.0
)

// scheduleRespawns finds every unit that died this tick (Status == dead,
// RespawnAt not yet set) with a "timer" RespawnConfig, and schedules
// RespawnAt. Deliberately not done at each individual death site (there
// are half a dozen, scattered across command and instance) - this single
// per-tick sweep catches all of them uniformly, the same way
// DamageTakenThisTick/DamageDealtThisTick avoid needing per-site
// bookkeeping (see status_triggers.go). Idempotent: RespawnAt being
// already set (or Respawn.Type != "timer") skips a unit, so this only
// ever schedules once per death.
func scheduleRespawns(state *instancestate.InstanceState, now time.Time) {
	for _, unit := range state.Units {
		if unit.Status != instancestate.UnitStatusDead {
			continue
		}
		if unit.Respawn.Type != "timer" || !unit.RespawnAt.IsZero() {
			continue
		}
		unit.RespawnAt = now.Add(time.Duration(unit.Respawn.DelaySeconds * float64(time.Second)))
	}
}

// tickRespawns advances the dead -> respawning -> idle state machine:
//
//   - dead, RespawnAt due: teleports the unit to its spawn point/map,
//     clears its corpse (loot, tags, lingering statuses), and starts the
//     visibly-respawning window (RespawningUntil).
//   - respawning, RespawningUntil elapsed: resets health/target/behavior
//     and returns the unit to idle - the same reset command.RespawnHandler
//     gives a player, since this is the NPC equivalent of that action
//     firing on a timer instead of a client request.
func tickRespawns(state *instancestate.InstanceState, now time.Time, rng *rand.Rand) {
	for _, unit := range state.Units {
		switch unit.Status {
		case instancestate.UnitStatusDead:
			if unit.RespawnAt.IsZero() || now.Before(unit.RespawnAt) {
				continue
			}
			beginRespawning(unit, now, rng)
		case instancestate.UnitStatusRespawning:
			if now.Before(unit.RespawningUntil) {
				continue
			}
			finishRespawning(unit)
		}
	}
}

func beginRespawning(unit *instancestate.UnitState, now time.Time, rng *rand.Rand) {
	unit.RespawnAt = time.Time{}
	unit.MapIdentifier = unit.SpawnMapIdentifier
	unit.Position = unit.SpawnPoint
	unit.LootItems = nil
	unit.TaggedBy = nil
	unit.ActiveStatusEffects = nil
	window := respawningWindowMinSeconds + rng.Float64()*(respawningWindowMaxSeconds-respawningWindowMinSeconds)
	unit.RespawningUntil = now.Add(time.Duration(window * float64(time.Second)))
	unit.Status = instancestate.UnitStatusRespawning
}

func finishRespawning(unit *instancestate.UnitState) {
	unit.RespawningUntil = time.Time{}
	unit.Health = unit.MaxHealth
	unit.Target = nil
	unit.Attacking = false
	unit.Behavior = instancestate.BehaviorState{}
	unit.Status = instancestate.UnitStatusIdle
}
