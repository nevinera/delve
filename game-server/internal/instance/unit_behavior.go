package instance

import (
	"math"
	"strings"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// npcMeleeRange is how close (feet) a chasing NPC stops from its target.
// Will be derived from power ranges once the combat system is in place.
const npcMeleeRange = 5.0

// npcEntry pairs an instance unit config with its resolved unit type.
type npcEntry struct {
	unit     instanceconfig.Unit
	unitType instanceconfig.UnitType
}

// playerRef is a live player unit with its state ID, used for aggro checks.
type playerRef struct {
	id   uuid.UUID
	unit *instancestate.UnitState
}

// applyUnitBehaviors is the NPC brain, called once per tick for every
// non-player unit. It handles aggro detection, status transitions, and
// dispatches to the appropriate movement routine.
//
// Future home of: aggro retargeting, battle AI (power selection/timing).
func applyUnitBehaviors(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64) {
	cfgByID := buildNPCConfigByID(zone)

	// Index live players by map for O(1) aggro checks.
	playersByMap := make(map[string][]playerRef)
	for id, u := range state.Units {
		if strings.HasPrefix(u.ZoneUnitIdentifier, "player:") && u.Status != instancestate.UnitStatusDead {
			playersByMap[u.MapIdentifier] = append(playersByMap[u.MapIdentifier], playerRef{id, u})
		}
	}

	// Index unit state by zone identifier for linked-aggro resolution.
	stateByZoneID := make(map[string]*instancestate.UnitState)
	for _, u := range state.Units {
		if u.ZoneUnitIdentifier != "" {
			stateByZoneID[u.ZoneUnitIdentifier] = u
		}
	}

	for _, unit := range state.Units {
		if strings.HasPrefix(unit.ZoneUnitIdentifier, "player:") {
			continue
		}
		e, ok := cfgByID[unit.ZoneUnitIdentifier]
		if !ok {
			continue
		}
		applyUnitBehavior(unit, e, state, playersByMap, stateByZoneID, dt)
	}
}

func applyUnitBehavior(
	unit *instancestate.UnitState,
	e npcEntry,
	state *instancestate.InstanceState,
	playersByMap map[string][]playerRef,
	stateByZoneID map[string]*instancestate.UnitState,
	dt float64,
) {
	sf := e.unitType.SpeedFactor
	if sf == 0 {
		sf = 1.0
	}
	speed := BaseMobSpeed * sf

	// Proactive aggro: transition idle hostile units when a player enters range.
	aggroRadius := e.unitType.AggroRadius
	if aggroRadius == 0 {
		aggroRadius = 20.0
	}
	if unit.Status == instancestate.UnitStatusIdle && e.unit.Hostility == "hostile" {
		if targetID := nearestPlayerInRadius(unit, playersByMap[unit.MapIdentifier], aggroRadius); targetID != nil {
			engageUnit(unit, *targetID)
			for _, link := range e.unit.Links {
				if linked, ok := stateByZoneID[link]; ok && linked.Status == instancestate.UnitStatusIdle {
					engageUnit(linked, *targetID)
				}
			}
		}
	}

	switch unit.Status {
	case instancestate.UnitStatusIdle:
		mv := e.unit.Movement
		if mv.Type == "" || mv.Type == "still" {
			return
		}
		if unit.Behavior.MovementPhase == "" {
			initNPCMovement(unit, mv)
			if unit.Behavior.MovementPhase == "" {
				return
			}
		}
		tickNPCMovement(unit, mv, speed, dt)

	case instancestate.UnitStatusEngaged:
		if unit.Target == nil {
			dropAggro(unit)
			return
		}
		target, ok := state.Units[*unit.Target]
		if !ok || target.Status == instancestate.UnitStatusDead {
			dropAggro(unit)
			return
		}
		chaseTarget(unit, target, speed, dt)

	case instancestate.UnitStatusDead:
		// Nothing.
	}
}

// chaseTarget moves unit straight toward target, stopping npcMeleeRange feet away.
func chaseTarget(unit, target *instancestate.UnitState, speed, dt float64) {
	dx := target.Position.X - unit.Position.X
	dy := target.Position.Y - unit.Position.Y
	dist := math.Sqrt(dx*dx + dy*dy)

	if dist > 0.01 {
		unit.Position.Angle = facingTowardDeg(unit.Position.X, unit.Position.Y, target.Position.X, target.Position.Y)
	}

	if dist <= npcMeleeRange {
		return
	}

	move := speed * dt
	stopAt := dist - npcMeleeRange
	if move > stopAt {
		move = stopAt
	}
	unit.Position.X += (dx / dist) * move
	unit.Position.Y += (dy / dist) * move
}

// engageUnit gives unit a target and transitions it to the engaged status.
func engageUnit(unit *instancestate.UnitState, targetID uuid.UUID) {
	id := targetID
	unit.Target = &id
	unit.Status = instancestate.UnitStatusEngaged
}

// dropAggro clears a unit's target, returns it to idle, and resets its
// movement phase so patrol/wander re-initializes on the next tick.
func dropAggro(unit *instancestate.UnitState) {
	unit.Target = nil
	unit.Status = instancestate.UnitStatusIdle
	unit.Behavior.MovementPhase = ""
}

// nearestPlayerInRadius returns the UUID of the closest player within radius
// feet of unit on the same map, or nil if none qualifies.
func nearestPlayerInRadius(unit *instancestate.UnitState, players []playerRef, radius float64) *uuid.UUID {
	rSq := radius * radius
	var bestID *uuid.UUID
	bestDSq := rSq + 1 // sentinel: larger than any valid match
	for _, pr := range players {
		dx := pr.unit.Position.X - unit.Position.X
		dy := pr.unit.Position.Y - unit.Position.Y
		dSq := dx*dx + dy*dy
		if dSq <= rSq && dSq < bestDSq {
			id := pr.id
			bestID = &id
			bestDSq = dSq
		}
	}
	return bestID
}

// buildNPCConfigByID indexes each zone unit by its identifier, paired with
// its resolved unit type. Used each tick to look up config for live units.
func buildNPCConfigByID(zone instanceconfig.Zone) map[string]npcEntry {
	m := make(map[string]npcEntry)
	for _, mp := range zone.Maps {
		for _, u := range mp.Units {
			if ut, ok := zone.UnitTypes[u.UnitType]; ok {
				m[u.Identifier] = npcEntry{u, ut}
			}
		}
	}
	return m
}
