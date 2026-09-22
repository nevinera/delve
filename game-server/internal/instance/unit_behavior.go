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
	"github.com/delve-mmo/game-server/internal/pathing"
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
func applyUnitBehaviors(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64, pathGraph *pathing.Graph) []CombatEvent {
	cfgByID := buildNPCConfigByID(zone)
	budget := &pathBudget{remaining: maxPathSearchesPerTick}

	// Index live players by map for O(1) aggro checks.
	playersByMap := make(map[string][]playerRef)
	for id, u := range state.Units {
		if strings.HasPrefix(u.ZoneUnitIdentifier, "player:") && u.Status != instancestate.UnitStatusDead {
			playersByMap[u.MapIdentifier] = append(playersByMap[u.MapIdentifier], playerRef{id, u})
		}
	}

	// Index unit state by zone identifier for grouped-aggro resolution.
	stateByZoneID := make(map[string]*instancestate.UnitState)
	for _, u := range state.Units {
		if u.ZoneUnitIdentifier != "" {
			stateByZoneID[u.ZoneUnitIdentifier] = u
		}
	}

	// Every unit on the same map sharing a groupIdentifier propagates aggro to each other.
	groupByID := instanceconfig.GroupedUnits(zone)

	var events []CombatEvent
	for id, unit := range state.Units {
		if strings.HasPrefix(unit.ZoneUnitIdentifier, "player:") {
			continue
		}
		e, ok := cfgByID[unit.ZoneUnitIdentifier]
		if !ok {
			continue
		}
		applyUnitBehavior(id, unit, e, state, zone, playersByMap, stateByZoneID, groupByID, dt, pathGraph, budget, &events)
	}

	applyNPCSeparation(state, zone, dt)
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
	groupByID map[string][]string,
	dt float64,
	pathGraph *pathing.Graph,
	budget *pathBudget,
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
			for _, groupmate := range groupByID[e.unit.Identifier] {
				if other, ok := stateByZoneID[groupmate]; ok && other.Status == instancestate.UnitStatusIdle {
					engageUnit(other, *targetID)
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
			// losClear is a zero-width ray test - fine for gating attacks (an
			// arrow doesn't need clearance for the archer's whole body), but
			// not for deciding whether to walk straight there: a ray can
			// graze past a corner clear while the unit's own radius sweeping
			// that same line would clip it. canWalkStraight adds that radius
			// check (via the map's pathing graph, sized for this unit's own
			// size bucket) so "direct pursuit" mode never sends a unit
			// grinding into a corner it only narrowly has line of sight past.
			canWalkStraight := losClear
			if pathGraph != nil {
				canWalkStraight = losClear && pathGraph.SegmentClear(unit.Radius, unit.MapIdentifier, unit.Position.X, unit.Position.Y, target.Position.X, target.Position.Y)
			}
			if canWalkStraight {
				unit.Behavior.PathWaypoints = nil // no longer detouring around anything
				chaseTarget(unit, target, speed, dt, effectiveBasicAttackRange(e.unitType))
			} else {
				// Can't walk straight there (blocked, or too close to a
				// corner for this body to fit past) - detour around
				// obstacles rather than walking into (or grinding along)
				// whatever's in the way.
				chaseAlongPath(unit, target, speed, dt, pathGraph, budget)
			}
			now := time.Now()
			if losClear {
				tryNPCBasicAttack(unitID, *unit.Target, unit, target, e.unitType, zone, now, events, state)
				if target.Status != instancestate.UnitStatusDead {
					tryNPCAttack(unitID, *unit.Target, unit, target, e.unitType.Powers, zone, now, events, state)
				}
			}
		} else {
			// Target crossed to another map. Head for whichever connection
			// leads there so we cross it too on a future tick.
			chaseAcrossMap(unit, target.MapIdentifier, speed, dt, pathGraph, budget)
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

	available := usablePowers(unit, powers, dist, target, now)
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
		case "resource":
			recipient := target
			if eff.Affects == "self" {
				recipient = unit
			}
			command.AdjustResource(recipient, eff.ResourceName, eff.Delta)
		}
	}
	if power.CostAmount > 0 {
		command.AdjustResource(unit, power.CostType, -power.CostAmount)
	}
	unit.GlobalCooldownEndsAt = now.Add(time.Duration(power.GlobalCooldown * float64(time.Second)))
	if power.Cooldown > 0 {
		if unit.PowerCooldowns == nil {
			unit.PowerCooldowns = make(map[string]time.Time)
		}
		unit.PowerCooldowns[power.Name] = now.Add(time.Duration(power.Cooldown * float64(time.Second)))
	}
	*events = append(*events, CombatEvent{
		AttackerID: attackerID.String(),
		TargetID:   targetID.String(),
		PowerName:  power.Name,
	})
}

// usablePowers filters powers down to the ones unit could fire right now
// against target at dist: off cooldown/affordable (command.PowerUsable) and
// with at least one effect that's a type/shape tryNPCAttack knows how to
// fire, in range (npcEffectUsable/npcEffectInRange). Once one is chosen,
// every one of its usable effects fires together (see the firing loop in
// tryNPCAttack), not just the one that made it eligible here - matches
// UsePowerHandler, which already applies every effect of the power a
// player casts. This is the same "could I use this at all" filter
// regardless of UnitTactics.Type - Tactics only decides *which* of these
// gets picked, never what counts as a candidate.
func usablePowers(unit *instancestate.UnitState, powers []instanceconfig.Power, dist float64, target *instancestate.UnitState, now time.Time) []instanceconfig.Power {
	var available []instanceconfig.Power
	for _, p := range powers {
		if !command.PowerUsable(unit, p, now) {
			continue
		}
		for _, eff := range p.Effects {
			if npcEffectUsable(eff) && npcEffectInRange(eff, dist, unit, target) {
				available = append(available, p)
				break
			}
		}
	}
	return available
}

// npcEffectUsable reports whether eff is a type/shape tryNPCAttack knows how
// to fire at all (a harm with an amount, a status with a status, or a
// resource with a resourceName).
func npcEffectUsable(eff instanceconfig.PowerEffect) bool {
	switch eff.Type {
	case "harm":
		return eff.Amount != nil
	case "status":
		return eff.Status != nil
	case "resource":
		return eff.ResourceName != ""
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
		physical := unitType.BasicAttackSchool != "magic"
		mean := unitType.DPS / unitType.AttackSpeed
		lo, hi := mean*(1-basicAttackVariance), mean*(1+basicAttackVariance)
		raw := math.Round((lo + rand.Float64()*(hi-lo)) * multiplier)
		raw = command.ApplyDamageDoneBonus(unit, physical, raw)
		target.Health -= command.IncomingDamage(target, zone, raw, physical)
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

// pathRecalcInterval limits how often a blocked-LOS chase even considers
// recomputing its waypoint path. The target moves a little every tick, but
// rerunning the search for that is unnecessary; the existing path stays
// good enough between recalculations.
const pathRecalcInterval = 0.75 // seconds

// pathGoalMoveThreshold is how far (feet) a chase target must have moved
// since the cached path was planned before an expired recalc timer actually
// triggers a new search. A target standing still, or drifting a little, keeps
// its chasers on their cached paths for free.
const pathGoalMoveThreshold = 3.0

// maxPathSearchesPerTick caps how many path searches one instance runs in a
// single tick, as a safety valve against many units all needing a path at
// once (a whole pack aggroing together, say) on a lightly-provisioned
// machine. Units beyond the cap keep following their cached path and simply
// retry next tick; there's no fairness bookkeeping since unit iteration
// order is already randomized.
const maxPathSearchesPerTick = 16

// pathBudget is one tick's remaining path-search allowance for an instance.
type pathBudget struct {
	remaining int
}

// take spends one search from the budget, reporting whether one was left.
func (b *pathBudget) take() bool {
	if b.remaining <= 0 {
		return false
	}
	b.remaining--
	return true
}

// waypointArriveDist is how close (feet) a unit must get to its current
// waypoint before advancing to the next one.
const waypointArriveDist = 0.5

// moveStraightToward moves unit directly toward (destX,destY) with no stop
// distance - used as the no-pathGraph/no-route fallback for both
// chaseAlongPath and chaseLastSeen, which never need to stop short (unlike
// chaseTarget, which stops at attack range when LOS is clear).
func moveStraightToward(unit *instancestate.UnitState, destX, destY, speed, dt float64) {
	dx, dy := destX-unit.Position.X, destY-unit.Position.Y
	dist := math.Sqrt(dx*dx + dy*dy)
	if dist < 0.01 {
		return
	}
	unit.Position.Angle = facingTowardDeg(unit.Position.X, unit.Position.Y, destX, destY)
	move := math.Min(speed*dt, dist)
	unit.Position.X += (dx / dist) * move
	unit.Position.Y += (dy / dist) * move
}

// moveAlongPlannedPath drives unit along its cached Behavior.PathWaypoints,
// recomputing via computePath whenever the cache is empty, its recalc timer
// has expired, or the next waypoint is no longer safely reachable from
// wherever the unit actually is (see MapGraph.SegmentClear's doc - crowd
// separation shoving the unit back around a corner it just rounded, say).
// If pathGraph is nil (pathing unavailable for this instance), calls
// fallback instead - the original pre-pathing "keep closing" behavior. If
// pathGraph is available but computePath finds no route, holds position:
// walking anyway would mean grinding into whatever it just confirmed is in
// the way. A later tick (target moved, a blocked start point cleared,
// etc.) gets another attempt.
//
// Shared by chaseAlongPath (chasing a same-map target around a corner) and
// chaseAcrossMap (heading for whichever connection leads to the map the
// target crossed to).
func moveAlongPlannedPath(unit *instancestate.UnitState, speed, dt float64, pathGraph *pathing.Graph, budget *pathBudget, goal *pathing.Point, computePath func() ([]pathing.Point, bool), fallback func()) {
	if pathGraph == nil {
		fallback()
		return
	}

	b := &unit.Behavior
	b.PathRecalcIn -= dt
	needsRecalc := len(b.PathWaypoints) == 0
	if !needsRecalc {
		next := b.PathWaypoints[0]
		if !pathGraph.SegmentClear(unit.Radius, unit.MapIdentifier, unit.Position.X, unit.Position.Y, next.X, next.Y) {
			needsRecalc = true
		}
	}
	if !needsRecalc && b.PathRecalcIn <= 0 {
		// Timer expired with a still-usable path: only worth a search if the
		// destination has actually moved. A nil goal is a fixed destination
		// (a map connection), which never goes stale on its own.
		if goal != nil && math.Hypot(goal.X-b.PathGoalX, goal.Y-b.PathGoalY) > pathGoalMoveThreshold {
			needsRecalc = true
		} else {
			b.PathRecalcIn = pathRecalcInterval
		}
	}
	if needsRecalc {
		if !budget.take() {
			// Out of searches this tick. Follow whatever cached path is
			// still safe; with none (or a blocked one), hold rather than
			// grind into whatever's in the way. Retried next tick.
			if len(b.PathWaypoints) == 0 || !pathGraph.SegmentClear(unit.Radius, unit.MapIdentifier, unit.Position.X, unit.Position.Y, b.PathWaypoints[0].X, b.PathWaypoints[0].Y) {
				return
			}
		} else {
			b.PathRecalcIn = pathRecalcInterval
			if goal != nil {
				b.PathGoalX, b.PathGoalY = goal.X, goal.Y
			}
			if wps, ok := computePath(); ok {
				b.PathWaypoints = wps
			} else {
				b.PathWaypoints = nil
			}
		}
	}

	if len(b.PathWaypoints) == 0 {
		return
	}

	next := b.PathWaypoints[0]
	dx, dy := next.X-unit.Position.X, next.Y-unit.Position.Y
	dist := math.Sqrt(dx*dx + dy*dy)

	if dist <= waypointArriveDist {
		b.PathWaypoints = b.PathWaypoints[1:]
		if len(b.PathWaypoints) == 0 {
			return
		}
		next = b.PathWaypoints[0]
		dx, dy = next.X-unit.Position.X, next.Y-unit.Position.Y
		dist = math.Sqrt(dx*dx + dy*dy)
	}

	if dist > 0.01 {
		unit.Position.Angle = facingTowardDeg(unit.Position.X, unit.Position.Y, next.X, next.Y)
	}
	move := math.Min(speed*dt, dist)
	unit.Position.X += (dx / dist) * move
	unit.Position.Y += (dy / dist) * move
}

// chaseAlongPath moves unit toward target when a direct line is blocked,
// detouring around obstacles instead of chaseTarget's straight line (which
// would walk it into whatever's in the way).
func chaseAlongPath(unit, target *instancestate.UnitState, speed, dt float64, pathGraph *pathing.Graph, budget *pathBudget) {
	goal := pathing.Point{X: target.Position.X, Y: target.Position.Y}
	moveAlongPlannedPath(unit, speed, dt, pathGraph, budget, &goal,
		func() ([]pathing.Point, bool) {
			return pathGraph.FindPath(unit.Radius, unit.MapIdentifier, unit.Position.X, unit.Position.Y, target.Position.X, target.Position.Y)
		},
		func() { moveStraightToward(unit, target.Position.X, target.Position.Y, speed, dt) },
	)
}

// chaseAcrossMap moves unit toward whichever connection on its current map
// leads to targetMapID, using the connections' own geometry rather than
// the target's last-seen position: applyMapTransitions runs before
// applyUnitBehaviors each tick, so by the tick a target actually crosses,
// its MapIdentifier has already changed and Behavior.LastSeenX/Y never
// gets a final update - it's frozen up to one full tick of the target's
// movement short of wherever it actually crossed. At typical player speed
// that's easily more than a connection's own trigger radius, so aiming at
// the connection itself (which FindPathTowardMap already knows the exact
// position of) is what reliably completes the follow, instead of almost
// always landing just short of it.
func chaseAcrossMap(unit *instancestate.UnitState, targetMapID string, speed, dt float64, pathGraph *pathing.Graph, budget *pathBudget) {
	moveAlongPlannedPath(unit, speed, dt, pathGraph, budget, nil,
		func() ([]pathing.Point, bool) {
			return pathGraph.FindPathTowardMap(unit.Radius, unit.MapIdentifier, unit.Position.X, unit.Position.Y, targetMapID)
		},
		func() { moveStraightToward(unit, unit.Behavior.LastSeenX, unit.Behavior.LastSeenY, speed, dt) },
	)
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
	unit.Behavior.PathWaypoints = nil // discard any detour left over from a previous target
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
// preventing clumping when multiple units chase the same target. A shove
// that would cross a barrier is skipped rather than applied - the intent is
// to relieve crowding, not to shove a unit through a wall it happens to be
// crowded up against. (restoreUnitsThatCrossedBarriers still runs at the end
// of every tick as a backstop, for any other path that moves a unit.)
func applyNPCSeparation(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64) {
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
			newX, newY := npcs[i].x+fx*dt, npcs[i].y+fy*dt
			if instanceconfig.LineOfSightClear(zone, npcs[i].mapID, npcs[i].x, npcs[i].y, newX, newY) {
				npcs[i].unit.Position.X, npcs[i].unit.Position.Y = newX, newY
			}
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
