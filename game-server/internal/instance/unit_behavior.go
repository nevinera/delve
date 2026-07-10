package instance

import (
	"math"
	"math/rand"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// npcMeleeRange is how close (feet) a chasing NPC stops from its target.
// Will be derived from power ranges once the combat system is in place.
const npcMeleeRange = 2.0

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

// CombatEvent records a power use by an NPC unit against a target.
type CombatEvent struct {
	AttackerID string
	TargetID   string
	PowerName  string
}

// applyUnitBehaviors is the NPC brain, called once per tick for every
// non-player unit. It handles aggro detection, status transitions, and
// dispatches to the appropriate movement routine.
func applyUnitBehaviors(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64) []CombatEvent {
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

	// Build a symmetric link index: if A lists B, both A→B and B→A propagate aggro.
	linkGroupByID := buildSymmetricLinkGroups(zone)

	var events []CombatEvent
	for id, unit := range state.Units {
		if strings.HasPrefix(unit.ZoneUnitIdentifier, "player:") {
			continue
		}
		e, ok := cfgByID[unit.ZoneUnitIdentifier]
		if !ok {
			continue
		}
		applyUnitBehavior(id, unit, e, state, playersByMap, stateByZoneID, linkGroupByID, dt, &events)
	}

	applyNPCSeparation(state, dt)
	return events
}

func applyUnitBehavior(
	unitID uuid.UUID,
	unit *instancestate.UnitState,
	e npcEntry,
	state *instancestate.InstanceState,
	playersByMap map[string][]playerRef,
	stateByZoneID map[string]*instancestate.UnitState,
	linkGroupByID map[string][]string,
	dt float64,
	events *[]CombatEvent,
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
			for _, link := range linkGroupByID[e.unit.Identifier] {
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
		tryNPCAttack(unitID, *unit.Target, unit, target, e.unitType.Powers, time.Now(), events)

	case instancestate.UnitStatusDead:
		// Nothing.
	}
}

// tryNPCAttack fires a randomly-chosen available harm power at the target if
// the unit is off GCD and at least one power is in range. Appends a CombatEvent
// to events if an attack fires.
func tryNPCAttack(attackerID, targetID uuid.UUID, unit, target *instancestate.UnitState, powers []instanceconfig.Power, now time.Time, events *[]CombatEvent) {
	if now.Before(unit.GlobalCooldownEndsAt) {
		return
	}

	dx := target.Position.X - unit.Position.X
	dy := target.Position.Y - unit.Position.Y
	dist := math.Sqrt(dx*dx + dy*dy)

	type candidate struct {
		power  instanceconfig.Power
		effect instanceconfig.PowerEffect
	}
	var available []candidate
	for _, p := range powers {
		for _, eff := range p.Effects {
			if eff.Type != "harm" || eff.Amount == nil {
				continue
			}
			maxRange := 5.0
			if eff.Range != nil {
				maxRange = eff.Range.Max()
			}
			if dist <= maxRange+unit.Radius+target.Radius {
				available = append(available, candidate{p, eff})
				break
			}
		}
	}
	if len(available) == 0 {
		return
	}

	c := available[rand.Intn(len(available))]
	lo, hi := c.effect.Amount.Min(), c.effect.Amount.Max()
	target.Health -= math.Round(lo + rand.Float64()*(hi-lo))
	if target.Health < 0 {
		target.Health = 0
	}
	if target.Health == 0 {
		target.Status = instancestate.UnitStatusDead
		target.Target = nil
	}
	unit.GlobalCooldownEndsAt = now.Add(time.Duration(c.power.GlobalCooldown * float64(time.Second)))
	*events = append(*events, CombatEvent{
		AttackerID: attackerID.String(),
		TargetID:   targetID.String(),
		PowerName:  c.power.Name,
	})
}

// chaseTarget moves unit straight toward target, stopping npcMeleeRange feet
// beyond the combined edge-to-edge distance (i.e., adding both token radii).
func chaseTarget(unit, target *instancestate.UnitState, speed, dt float64) {
	dx := target.Position.X - unit.Position.X
	dy := target.Position.Y - unit.Position.Y
	dist := math.Sqrt(dx*dx + dy*dy)

	if dist > 0.01 {
		unit.Position.Angle = facingTowardDeg(unit.Position.X, unit.Position.Y, target.Position.X, target.Position.Y)
	}

	stopDist := npcMeleeRange + unit.Radius + target.Radius
	if dist <= stopDist {
		return
	}

	move := speed * dt
	stopAt := dist - stopDist
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

const (
	separationRadius   = 2.0  // feet - sum of two half-radii; allows substantial overlap
	separationStrength = 12.0 // feet/sec of push force at full overlap
)

// applyNPCSeparation pushes NPC units apart when they crowd each other,
// preventing clumping when multiple units chase the same target.
func applyNPCSeparation(state *instancestate.InstanceState, dt float64) {
	type entry struct {
		unit *instancestate.UnitState
		x, y float64
	}
	var npcs []entry
	for _, u := range state.Units {
		if strings.HasPrefix(u.ZoneUnitIdentifier, "player:") || u.Status == instancestate.UnitStatusDead {
			continue
		}
		npcs = append(npcs, entry{u, u.Position.X, u.Position.Y})
	}

	for i := range npcs {
		var fx, fy float64
		for j := range npcs {
			if i == j {
				continue
			}
			dx := npcs[i].x - npcs[j].x
			dy := npcs[i].y - npcs[j].y
			dist := math.Sqrt(dx*dx + dy*dy)
			if dist >= separationRadius || dist < 0.001 {
				continue
			}
			mag := (separationRadius - dist) / separationRadius * separationStrength
			fx += (dx / dist) * mag
			fy += (dy / dist) * mag
		}
		if fx != 0 || fy != 0 {
			npcs[i].unit.Position.X += fx * dt
			npcs[i].unit.Position.Y += fy * dt
		}
	}
}

// buildSymmetricLinkGroups returns a map from unit identifier to all units
// linked to it, treating links as symmetric: if A lists B, both A→B and B→A
// are included, so zone configs don't need to define links in both directions.
func buildSymmetricLinkGroups(zone instanceconfig.Zone) map[string][]string {
	seen := make(map[string]map[string]struct{})
	add := func(a, b string) {
		if seen[a] == nil {
			seen[a] = make(map[string]struct{})
		}
		seen[a][b] = struct{}{}
	}
	for _, mp := range zone.Maps {
		for _, u := range mp.Units {
			for _, link := range u.Links {
				add(u.Identifier, link)
				add(link, u.Identifier)
			}
		}
	}
	result := make(map[string][]string, len(seen))
	for id, set := range seen {
		links := make([]string, 0, len(set))
		for link := range set {
			links = append(links, link)
		}
		result[id] = links
	}
	return result
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
