package instance

import (
	"math"
	"math/rand"
	"strings"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

const (
	BaseMobSpeed = 10.0 // feet/sec — matches demo.html BASE_UNIT_SPEED
	turnDuration = 0.3  // seconds to complete a facing-turn animation
)

const (
	mobPhaseMoving  = "moving"
	mobPhaseWaiting = "waiting"
	mobPhaseTurning = "turning"
)

// applyNPCMovement drives the movement state machine for all NPC units each tick.
// Units with "still" or missing movement config are skipped. Units that have
// not yet been initialized (MovementPhase == "") are initialized on the first call.
func applyNPCMovement(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64) {
	type entry struct {
		unit     instanceconfig.Unit
		unitType instanceconfig.UnitType
	}
	cfgByID := make(map[string]entry)
	for _, m := range zone.Maps {
		for _, u := range m.Units {
			if ut, ok := zone.UnitTypes[u.UnitType]; ok {
				cfgByID[u.Identifier] = entry{u, ut}
			}
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
		mv := e.unit.Movement
		if mv.Type == "" || mv.Type == "still" {
			continue
		}

		sf := e.unitType.SpeedFactor
		if sf == 0 {
			sf = 1.0
		}
		speed := BaseMobSpeed * sf

		if unit.Behavior.MovementPhase == "" {
			initNPCMovement(unit, mv)
			if unit.Behavior.MovementPhase == "" {
				continue // init failed (e.g. empty patrol steps or missing wander location)
			}
		}

		tickNPCMovement(unit, mv, speed, dt)
	}
}

// initNPCMovement sets the initial movement state for a unit on its first tick.
func initNPCMovement(unit *instancestate.UnitState, mv instanceconfig.UnitMovement) {
	b := &unit.Behavior
	switch mv.Type {
	case "patrol":
		if len(mv.Steps) < 2 {
			return
		}
		b.PatrolDir = 1
		b.PatrolStepIndex = 0
		b.PendingStepIndex = 0
		step := mv.Steps[0]
		b.TargetX = step.Position.X
		b.TargetY = step.Position.Y
		b.MoveRate = step.MovementRate
		if dx, dy := step.Position.X-unit.Position.X, step.Position.Y-unit.Position.Y; dx*dx+dy*dy > 0.0001 {
			unit.Position.Angle = facingTowardDeg(unit.Position.X, unit.Position.Y, step.Position.X, step.Position.Y)
		}
		b.MovementPhase = mobPhaseMoving

	case "wander":
		if mv.Location == nil {
			return
		}
		tx, ty := randInCircle(mv.Location.X, mv.Location.Y, mv.Radius)
		b.TargetX = tx
		b.TargetY = ty
		b.MoveRate = sampleRangePtr(mv.Speed, 1.0)
		if dx, dy := tx-unit.Position.X, ty-unit.Position.Y; dx*dx+dy*dy > 0.0001 {
			unit.Position.Angle = facingTowardDeg(unit.Position.X, unit.Position.Y, tx, ty)
		}
		b.MovementPhase = mobPhaseMoving
	}
}

// tickNPCMovement advances one tick of the state machine for a single unit.
func tickNPCMovement(unit *instancestate.UnitState, mv instanceconfig.UnitMovement, speed, dt float64) {
	b := &unit.Behavior
	switch b.MovementPhase {

	case mobPhaseWaiting:
		b.WaitRemaining -= dt
		if b.WaitRemaining > 0 {
			return
		}
		npcBeginTurn(unit, mv)

	case mobPhaseTurning:
		b.TurnElapsed += dt
		t := b.TurnElapsed / turnDuration
		if t > 1.0 {
			t = 1.0
		}
		unit.Position.Angle = lerpAngleDeg(b.TurnStartAngle, b.TurnEndAngle, t)
		if t >= 1.0 {
			unit.Position.Angle = b.TurnEndAngle
			b.PatrolStepIndex = b.PendingStepIndex
			b.MovementPhase = mobPhaseMoving
		}

	case mobPhaseMoving:
		dx := b.TargetX - unit.Position.X
		dy := b.TargetY - unit.Position.Y
		dist := math.Sqrt(dx*dx + dy*dy)
		move := speed * b.MoveRate * dt

		if dist <= move || dist < 0.01 {
			unit.Position.X = b.TargetX
			unit.Position.Y = b.TargetY
			npcArriveAtTarget(unit, mv)
		} else {
			unit.Position.X += (dx / dist) * move
			unit.Position.Y += (dy / dist) * move
		}
	}
}

// npcBeginTurn starts a turning animation from the current facing toward (tx, ty).
// pendingStepIndex is the patrol step to apply when the turn completes.
func npcBeginTurn(unit *instancestate.UnitState, mv instanceconfig.UnitMovement) {
	b := &unit.Behavior
	var tx, ty, moveRate float64
	var pendingStep int

	switch mv.Type {
	case "patrol":
		pendingStep = nextPatrolStep(b, len(mv.Steps), mv.Choose)
		step := mv.Steps[pendingStep]
		tx, ty = step.Position.X, step.Position.Y
		moveRate = step.MovementRate
	case "wander":
		if mv.Location == nil {
			return
		}
		tx, ty = randInCircle(mv.Location.X, mv.Location.Y, mv.Radius)
		moveRate = sampleRangePtr(mv.Speed, 1.0)
		pendingStep = b.PatrolStepIndex // wander doesn't use this, keep unchanged
	default:
		return
	}

	b.TargetX = tx
	b.TargetY = ty
	b.MoveRate = moveRate
	b.PendingStepIndex = pendingStep
	b.TurnStartAngle = unit.Position.Angle
	b.TurnEndAngle = facingTowardDeg(unit.Position.X, unit.Position.Y, tx, ty)
	b.TurnElapsed = 0
	b.MovementPhase = mobPhaseTurning
}

// npcArriveAtTarget is called when a unit reaches its movement target.
// When wait == 0 it picks the next destination immediately (no turning phase).
// When wait > 0 it enters the waiting phase.
func npcArriveAtTarget(unit *instancestate.UnitState, mv instanceconfig.UnitMovement) {
	b := &unit.Behavior
	switch mv.Type {
	case "patrol":
		wait := sampleRange(mv.Steps[b.PatrolStepIndex].WaitTime)
		if wait <= 0 {
			nextIdx := nextPatrolStep(b, len(mv.Steps), mv.Choose)
			step := mv.Steps[nextIdx]
			unit.Position.Angle = facingTowardDeg(unit.Position.X, unit.Position.Y, step.Position.X, step.Position.Y)
			b.PatrolStepIndex = nextIdx
			b.TargetX = step.Position.X
			b.TargetY = step.Position.Y
			b.MoveRate = step.MovementRate
			// remain in mobPhaseMoving
		} else {
			b.WaitRemaining = wait
			b.MovementPhase = mobPhaseWaiting
		}

	case "wander":
		if mv.Location == nil {
			return
		}
		wait := sampleRangePtr(mv.WaitTime, 0)
		if wait <= 0 {
			tx, ty := randInCircle(mv.Location.X, mv.Location.Y, mv.Radius)
			unit.Position.Angle = facingTowardDeg(unit.Position.X, unit.Position.Y, tx, ty)
			b.TargetX = tx
			b.TargetY = ty
			b.MoveRate = sampleRangePtr(mv.Speed, 1.0)
			// remain in mobPhaseMoving
		} else {
			b.WaitRemaining = wait
			b.MovementPhase = mobPhaseWaiting
		}
	}
}

// nextPatrolStep returns the next step index and updates PatrolDir for "return" mode.
func nextPatrolStep(b *instancestate.BehaviorState, n int, choose string) int {
	switch choose {
	case "loop":
		return (b.PatrolStepIndex + 1) % n
	case "return":
		if b.PatrolDir == 0 {
			b.PatrolDir = 1
		}
		next := b.PatrolStepIndex + b.PatrolDir
		if next >= n {
			b.PatrolDir = -1
			next = n - 2
		} else if next < 0 {
			b.PatrolDir = 1
			next = 1
		}
		if next < 0 {
			next = 0
		}
		if next >= n {
			next = n - 1
		}
		return next
	case "random":
		if n <= 1 {
			return 0
		}
		idx := rand.Intn(n - 1)
		if idx >= b.PatrolStepIndex {
			idx++
		}
		return idx
	}
	return 0
}

// facingTowardDeg returns degrees clockwise from north to face from (x1,y1) toward (x2,y2).
func facingTowardDeg(x1, y1, x2, y2 float64) float64 {
	return math.Atan2(x2-x1, y2-y1) * 180 / math.Pi
}

// lerpAngleDeg interpolates from a to b (degrees) via the shortest arc.
func lerpAngleDeg(a, b, t float64) float64 {
	diff := b - a
	for diff > 180 {
		diff -= 360
	}
	for diff < -180 {
		diff += 360
	}
	return a + diff*t
}

// randInCircle returns a uniformly random point within radius r of (cx, cy).
func randInCircle(cx, cy, r float64) (float64, float64) {
	angle := rand.Float64() * 2 * math.Pi
	dist := math.Sqrt(rand.Float64()) * r
	return cx + math.Cos(angle)*dist, cy + math.Sin(angle)*dist
}

// sampleRange samples a value uniformly from a ValueRange.
func sampleRange(vr instanceconfig.ValueRange) float64 {
	lo, hi := vr.Min(), vr.Max()
	if lo >= hi {
		return lo
	}
	return lo + rand.Float64()*(hi-lo)
}

// sampleRangePtr samples from a *ValueRange, returning def if the pointer is nil.
func sampleRangePtr(vr *instanceconfig.ValueRange, def float64) float64 {
	if vr == nil {
		return def
	}
	return sampleRange(*vr)
}
