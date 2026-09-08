package instance

import (
	"math"
	"math/rand"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// npcChaseStopBuffer is how far short (feet) of its basic-attack range a
// chasing NPC stops, so it isn't sitting exactly on the edge of range.
const npcChaseStopBuffer = 1.0

// basicAttackRange is the default (melee) reach (feet) of an NPC's basic
// attack, used when its UnitType doesn't set BasicAttackRange.
const basicAttackRange = 5.0

// effectiveBasicAttackRange returns unitType's basic-attack range, falling
// back to the melee default when unset.
func effectiveBasicAttackRange(unitType instanceconfig.UnitType) float64 {
	if unitType.BasicAttackRange > 0 {
		return unitType.BasicAttackRange
	}
	return basicAttackRange
}

// basicAttackVariance is the +/- fraction applied to a basic attack's mean
// damage (UnitType.DPS / UnitType.AttackSpeed) to avoid flat, unvarying hits.
const basicAttackVariance = 0.15

// leashHealPctPerSecond is the fraction of max health a leashing unit
// regenerates per second while returning to its leash point.
const leashHealPctPerSecond = 0.20

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

// CombatEvent records a power use (including a basic-attack swing) by one
// unit against another. Defined in instancestate so command handlers, which
// can't import this package, can also append to it via
// InstanceState.PendingCombatEvents.
type CombatEvent = instancestate.CombatEvent

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
	linkGroupByID := instanceconfig.SymmetricLinkGroups(zone)

	var events []CombatEvent
	for id, unit := range state.Units {
		if strings.HasPrefix(unit.ZoneUnitIdentifier, "player:") {
			continue
		}
		e, ok := cfgByID[unit.ZoneUnitIdentifier]
		if !ok {
			continue
		}
		applyUnitBehavior(id, unit, e, state, zone, playersByMap, stateByZoneID, linkGroupByID, dt, &events)
	}

	applyNPCSeparation(state, dt)
	return events
}

func applyUnitBehavior(
	unitID uuid.UUID,
	unit *instancestate.UnitState,
	e npcEntry,
	state *instancestate.InstanceState,
	zone instanceconfig.Zone,
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
			startLeash(unit)
			return
		}
		target, ok := state.Units[*unit.Target]
		if !ok || target.Status == instancestate.UnitStatusDead {
			startLeash(unit)
			return
		}
		if target.MapIdentifier == unit.MapIdentifier {
			unit.Behavior.LastSeenX = target.Position.X
			unit.Behavior.LastSeenY = target.Position.Y
			losClear := instanceconfig.LineOfSightClear(zone, unit.MapIdentifier, unit.Position.X, unit.Position.Y, target.Position.X, target.Position.Y)
			chaseRange := effectiveBasicAttackRange(e.unitType)
			if !losClear {
				// Can't see the target from here (e.g. around a corner) - keep
				// closing in rather than sitting at max range doing nothing.
				chaseRange = 0
			}
			chaseTarget(unit, target, speed, dt, chaseRange)
			now := time.Now()
			if losClear {
				tryNPCBasicAttack(unitID, *unit.Target, unit, target, e.unitType, zone, now, events, state)
				if target.Status != instancestate.UnitStatusDead {
					tryNPCAttack(unitID, *unit.Target, unit, target, e.unitType.Powers, zone, now, events, state)
				}
			}
		} else {
			// Target crossed to another map. Move toward last known position so
			// we reach the connection and traverse it on a future tick.
			chaseLastSeen(unit, speed, dt)
		}

	case instancestate.UnitStatusLeashing:
		unit.Health = math.Min(unit.MaxHealth, unit.Health+unit.MaxHealth*leashHealPctPerSecond*dt)

		if unit.MapIdentifier != unit.Behavior.LeashMapID {
			unit.MapIdentifier = unit.Behavior.LeashMapID
			unit.Position.X = unit.Behavior.LeashX
			unit.Position.Y = unit.Behavior.LeashY
			unit.Status = instancestate.UnitStatusIdle
			unit.Behavior.MovementPhase = ""
			unit.TaggedBy = nil
			return
		}
		dx := unit.Behavior.LeashX - unit.Position.X
		dy := unit.Behavior.LeashY - unit.Position.Y
		dist := math.Sqrt(dx*dx + dy*dy)
		if dist < 0.5 {
			unit.Position.X = unit.Behavior.LeashX
			unit.Position.Y = unit.Behavior.LeashY
			unit.Status = instancestate.UnitStatusIdle
			unit.Behavior.MovementPhase = ""
			unit.TaggedBy = nil
			return
		}
		unit.Position.Angle = facingTowardDeg(unit.Position.X, unit.Position.Y, unit.Behavior.LeashX, unit.Behavior.LeashY)
		move := math.Min(speed*dt, dist)
		unit.Position.X += (dx / dist) * move
		unit.Position.Y += (dy / dist) * move

	case instancestate.UnitStatusDead:
		// Nothing.
	}
}

// tryNPCAttack fires a randomly-chosen available harm power at the target if
// the unit is off GCD and at least one power is in range. Appends a CombatEvent
// to events if an attack fires.
func tryNPCAttack(attackerID, targetID uuid.UUID, unit, target *instancestate.UnitState, powers []instanceconfig.Power, zone instanceconfig.Zone, now time.Time, events *[]CombatEvent, state *instancestate.InstanceState) {
	if now.Before(unit.GlobalCooldownEndsAt) {
		return
	}

	dx := target.Position.X - unit.Position.X
	dy := target.Position.Y - unit.Position.Y
	dist := math.Sqrt(dx*dx + dy*dy)

	// A power is a candidate if at least one of its effects is currently
	// usable (right type, right shape, in range if not self-affecting) -
	// once chosen, every one of its usable effects fires together (see
	// npcEffectInRange/firing loop below), not just the one that made it
	// eligible. This matches UsePowerHandler, which already applies every
	// effect of the power a player casts.
	var available []instanceconfig.Power
	for _, p := range powers {
		for _, eff := range p.Effects {
			if npcEffectUsable(eff) && npcEffectInRange(eff, dist, unit, target) {
				available = append(available, p)
				break
			}
		}
	}
	if len(available) == 0 {
		return
	}

	power := available[rand.Intn(len(available))]
	for _, eff := range power.Effects {
		if !npcEffectUsable(eff) || !npcEffectInRange(eff, dist, unit, target) {
			continue
		}
		switch eff.Type {
		case "status":
			recipient := target
			if eff.Affects == "self" {
				recipient = unit
			} else {
				// Casting at a hostile target is an attack too - it aggros
				// an idle hostile target and can be resisted, same as harm.
				// Resistibility is a property of this cast (who it's aimed
				// at), not of the Status itself - see command.IsHostileAffects.
				command.EngageOnAttack(target, attackerID, zone, state)
				if command.IsHostileAffects(eff.Affects) {
					if missed, _ := command.RollAttackOutcome(0); missed {
						continue // resisted
					}
				}
			}
			command.ApplyStatus(recipient, unit, attackerID, *eff.Status, eff.Duration, zone, now)
		case "harm":
			timeBudget := command.PowerEffectTimeBudget(power)
			raw := command.PowerEffectAmount(unit, zone, eff, timeBudget, false, false)
			target.Health -= command.IncomingDamage(target, zone, raw, eff.School != "magic")
			if target.Health < 0 {
				target.Health = 0
			}
			if target.Health == 0 {
				target.Status = instancestate.UnitStatusDead
				target.Target = nil
				instancestate.RollAndRecordLoot(targetID, target, state)
			}
		}
	}
	unit.GlobalCooldownEndsAt = now.Add(time.Duration(power.GlobalCooldown * float64(time.Second)))
	*events = append(*events, CombatEvent{
		AttackerID: attackerID.String(),
		TargetID:   targetID.String(),
		PowerName:  power.Name,
	})
}

// npcEffectUsable reports whether eff is a type/shape tryNPCAttack knows how
// to fire at all (a harm with an amount, or a status with a status).
func npcEffectUsable(eff instanceconfig.PowerEffect) bool {
	switch eff.Type {
	case "harm":
		return eff.Amount != nil
	case "status":
		return eff.Status != nil
	default:
		return false
	}
}

// npcEffectInRange reports whether eff can currently reach its recipient -
// always true for a self-affecting effect (no target distance to check).
func npcEffectInRange(eff instanceconfig.PowerEffect, dist float64, unit, target *instancestate.UnitState) bool {
	if eff.Affects == "self" {
		return true
	}
	maxRange := 5.0
	if eff.Range != nil {
		maxRange = eff.Range.Max()
	}
	return dist <= maxRange+unit.Radius+target.Radius
}

// tryNPCBasicAttack fires unit's weapon-less basic attack at target if the
// unit is auto-attacking, its swing timer is up, and the target is in range.
// Damage per hit is UnitType.DPS/AttackSpeed, +/- basicAttackVariance, then
// reduced by target's Avoidance/Defence Rating per UnitType.BasicAttackSchool
// (see command.IncomingDamage) - a nonzero reduction only when target is a
// player, since NPCs carry no itemized stats of their own.
func tryNPCBasicAttack(attackerID, targetID uuid.UUID, unit, target *instancestate.UnitState, unitType instanceconfig.UnitType, zone instanceconfig.Zone, now time.Time, events *[]CombatEvent, state *instancestate.InstanceState) {
	if !unit.Attacking || unitType.AttackSpeed <= 0 {
		return
	}
	if now.Before(unit.NextBasicAttackAt) {
		return
	}

	attackRange := effectiveBasicAttackRange(unitType)
	dx := target.Position.X - unit.Position.X
	dy := target.Position.Y - unit.Position.Y
	dist := math.Sqrt(dx*dx + dy*dy)
	if dist > attackRange+unit.Radius+target.Radius {
		return
	}

	unit.NextBasicAttackAt = now.Add(time.Duration(float64(time.Second) / unitType.AttackSpeed))

	// Same universal miss/crit roll a player's basic attack gets - see
	// command.RollAttackOutcome. A miss still swings (the event still
	// fires) but deals no damage, same as a player's missed swing.
	_, critChancePct, _ := command.UnitCombatStats(unit, zone)
	if missed, multiplier := command.RollAttackOutcome(critChancePct); !missed {
		mean := unitType.DPS / unitType.AttackSpeed
		lo, hi := mean*(1-basicAttackVariance), mean*(1+basicAttackVariance)
		raw := math.Round((lo + rand.Float64()*(hi-lo)) * multiplier)
		target.Health -= command.IncomingDamage(target, zone, raw, unitType.BasicAttackSchool != "magic")
		if target.Health < 0 {
			target.Health = 0
		}
		if target.Health == 0 {
			target.Status = instancestate.UnitStatusDead
			target.Target = nil
			instancestate.RollAndRecordLoot(targetID, target, state)
		}
	}
	*events = append(*events, CombatEvent{
		AttackerID: attackerID.String(),
		TargetID:   targetID.String(),
		PowerName:  "Basic Attack",
	})
}

// chaseTarget moves unit straight toward target, stopping npcChaseStopBuffer
// feet short of attackRange beyond the combined edge-to-edge distance (i.e.,
// adding both token radii).
func chaseTarget(unit, target *instancestate.UnitState, speed, dt, attackRange float64) {
	dx := target.Position.X - unit.Position.X
	dy := target.Position.Y - unit.Position.Y
	dist := math.Sqrt(dx*dx + dy*dy)

	if dist > 0.01 {
		unit.Position.Angle = facingTowardDeg(unit.Position.X, unit.Position.Y, target.Position.X, target.Position.Y)
	}

	stopDist := math.Max(0, attackRange-npcChaseStopBuffer) + unit.Radius + target.Radius
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

// chaseLastSeen moves unit toward the last recorded position of its target.
// Used when the target has crossed to another map; no stop distance is applied
// so the unit walks all the way to the connection and triggers a map transition.
func chaseLastSeen(unit *instancestate.UnitState, speed, dt float64) {
	dx := unit.Behavior.LastSeenX - unit.Position.X
	dy := unit.Behavior.LastSeenY - unit.Position.Y
	dist := math.Sqrt(dx*dx + dy*dy)
	if dist < 0.01 {
		return
	}
	unit.Position.Angle = facingTowardDeg(unit.Position.X, unit.Position.Y, unit.Behavior.LastSeenX, unit.Behavior.LastSeenY)
	move := math.Min(speed*dt, dist)
	unit.Position.X += (dx / dist) * move
	unit.Position.Y += (dy / dist) * move
}

// engageUnit gives unit a target and transitions it to the engaged status.
// Records the current position as the leash point on first engagement (idle→engaged).
func engageUnit(unit *instancestate.UnitState, targetID uuid.UUID) {
	if unit.Status == instancestate.UnitStatusIdle {
		unit.Behavior.LeashX = unit.Position.X
		unit.Behavior.LeashY = unit.Position.Y
		unit.Behavior.LeashMapID = unit.MapIdentifier
	}
	id := targetID
	unit.Target = &id
	unit.Attacking = true
	unit.Status = instancestate.UnitStatusEngaged
}

// startLeash clears a unit's target and begins leashing it back to the position
// where it engaged. If the unit is on a different map than the leash point, it
// is snapped back immediately and returned to idle.
func startLeash(unit *instancestate.UnitState) {
	unit.Target = nil
	unit.Attacking = false
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
		unit  *instancestate.UnitState
		x, y  float64
		mapID string
	}
	var npcs []entry
	for _, u := range state.Units {
		if strings.HasPrefix(u.ZoneUnitIdentifier, "player:") || u.Status == instancestate.UnitStatusDead {
			continue
		}
		npcs = append(npcs, entry{u, u.Position.X, u.Position.Y, u.MapIdentifier})
	}

	for i := range npcs {
		var fx, fy float64
		for j := range npcs {
			if i == j || npcs[i].mapID != npcs[j].mapID {
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
