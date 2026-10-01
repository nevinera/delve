package instance

import (
	"math"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// Leashing follows modern WoW (see docs/schema/map.md's "Leashing"): an
// engaged NPC gives up the chase -
//   - within its leash radius, after leashQuietInside with no damage either way
//     (a target it can't reach);
//   - beyond the radius, once leashQuietOutside passes with no damage - so it
//     keeps chasing for as long as the fight goes on;
//   - beyond leashHardCapFactor x the radius, at once;
//   - with a hard leash (boss encounters), the moment it leaves the radius.
const (
	leashQuietInside   = 10 * time.Second
	leashQuietOutside  = 6 * time.Second
	leashHardCapFactor = 3.0
)

// leashDistance is how far an engaged unit is from its leash point: plain
// distance on its leash map; on the one map it chased into, the distance it
// had covered when it left plus its distance from where it arrived; and
// infinite anywhere further (see BehaviorState's crossing fields).
func leashDistance(unit *instancestate.UnitState) float64 {
	b := &unit.Behavior
	switch {
	case b.LeftLeashArea:
		return math.Inf(1)
	case unit.MapIdentifier == b.LeashMapID:
		return math.Hypot(unit.Position.X-b.LeashX, unit.Position.Y-b.LeashY)
	case unit.MapIdentifier == b.ArrivalMapID:
		return b.CrossingDistance + math.Hypot(unit.Position.X-b.ArrivalX, unit.Position.Y-b.ArrivalY)
	default:
		return math.Inf(1)
	}
}

// shouldLeash applies the leash rules above to an engaged unit.
func shouldLeash(unit *instancestate.UnitState, leash instanceconfig.Leash, now time.Time) bool {
	dist := leashDistance(unit)
	quiet := now.Sub(unit.Behavior.LastCombatAt)
	switch {
	case dist > leash.Radius*leashHardCapFactor:
		return true
	case dist > leash.Radius:
		return leash.Hard || quiet >= leashQuietOutside
	default:
		return quiet >= leashQuietInside
	}
}

// recordLeashCrossing tracks an engaged NPC's chase between maps (see
// leashDistance), given where it was just before crossing.
func recordLeashCrossing(unit *instancestate.UnitState, fromMapID string, prevX, prevY float64) {
	b := &unit.Behavior
	switch {
	case unit.MapIdentifier == b.LeashMapID:
		// Back home: plain distance applies again.
		b.ArrivalMapID = ""
		b.CrossingDistance = 0
	case fromMapID == b.LeashMapID:
		b.CrossingDistance = math.Hypot(prevX-b.LeashX, prevY-b.LeashY)
		b.ArrivalMapID = unit.MapIdentifier
		b.ArrivalX = unit.Position.X
		b.ArrivalY = unit.Position.Y
	default:
		b.LeftLeashArea = true
	}
}

// updateCombatClocks stamps LastCombatAt on every unit that dealt or took
// damage this tick. Must run after all of the tick's damage, before
// processTriggeredStatusEffects clears the per-tick flags.
func updateCombatClocks(state *instancestate.InstanceState, now time.Time) {
	for _, unit := range state.Units {
		if unit.DamageDealtThisTick || unit.DamageTakenThisTick {
			unit.Behavior.LastCombatAt = now
		}
	}
}

// leashPack leashes unit and every engaged member of its group together, so
// a member that reached home can't be pulled straight back out by a
// groupmate that's still fighting.
func leashPack(unitID uuid.UUID, unit *instancestate.UnitState, state *instancestate.InstanceState, groupmates []string, stateByZoneID map[string]*instancestate.UnitState) {
	startLeash(unitID, unit)
	for _, zoneID := range groupmates {
		other, ok := stateByZoneID[zoneID]
		if !ok || other.Status != instancestate.UnitStatusEngaged {
			continue
		}
		for otherID, u := range state.Units {
			if u == other {
				startLeash(otherID, other)
				break
			}
		}
	}
}

// groupmateTarget returns a live target one of unit's engaged groupmates is
// fighting, so a unit whose own target is gone joins in rather than the
// whole pack resetting.
func groupmateTarget(state *instancestate.InstanceState, groupmates []string, stateByZoneID map[string]*instancestate.UnitState) *uuid.UUID {
	for _, zoneID := range groupmates {
		other, ok := stateByZoneID[zoneID]
		if !ok || other.Status != instancestate.UnitStatusEngaged || other.Target == nil {
			continue
		}
		if target, ok := state.Units[*other.Target]; ok && target.Status.IsTargetable() {
			id := *other.Target
			return &id
		}
	}
	return nil
}

// startLeash resets a unit and sends it home: it drops its target, cast,
// and loot tag, heals to full, and loses every status others applied to it.
// While leashing nothing engages it (only idle units engage). If its leash
// point is on another map it's snapped back there at once.
func startLeash(unitID uuid.UUID, unit *instancestate.UnitState) {
	unit.Target = nil
	unit.Attacking = false
	unit.Casting = nil
	unit.TaggedBy = nil
	unit.Health = unit.MaxHealth
	kept := unit.ActiveStatusEffects[:0]
	for _, e := range unit.ActiveStatusEffects {
		if e.ApplierID == unitID {
			kept = append(kept, e)
		}
	}
	unit.ActiveStatusEffects = kept
	unit.Behavior.PathWaypoints = nil
	unit.Behavior.ArrivalMapID = ""
	unit.Behavior.CrossingDistance = 0
	unit.Behavior.LeftLeashArea = false
	if unit.MapIdentifier != unit.Behavior.LeashMapID {
		unit.MapIdentifier = unit.Behavior.LeashMapID
		unit.Position.X = unit.Behavior.LeashX
		unit.Position.Y = unit.Behavior.LeashY
		unit.Status = instancestate.UnitStatusIdle
		unit.Behavior.MovementPhase = ""
		return
	}
	unit.Status = instancestate.UnitStatusLeashing
}
