package instance

import (
	"math"
	"math/rand"

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

// initNPCMovement sets the initial movement state for a unit or NCU on its first tick.
func initNPCMovement(pos *instanceconfig.Position, b *instancestate.MovementState, mv instanceconfig.UnitMovement, rng *rand.Rand) {
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
		if dx, dy := step.Position.X-pos.X, step.Position.Y-pos.Y; dx*dx+dy*dy > 0.0001 {
			pos.Angle = facingTowardDeg(pos.X, pos.Y, step.Position.X, step.Position.Y)
		}
		b.MovementPhase = mobPhaseMoving

	case "wander":
		if mv.Location == nil {
			return
		}
		tx, ty := randInCircle(mv.Location.X, mv.Location.Y, mv.Radius, rng)
		b.TargetX = tx
		b.TargetY = ty
		b.MoveRate = sampleRangePtr(mv.Speed, 1.0, rng)
		if dx, dy := tx-pos.X, ty-pos.Y; dx*dx+dy*dy > 0.0001 {
			pos.Angle = facingTowardDeg(pos.X, pos.Y, tx, ty)
		}
		b.MovementPhase = mobPhaseMoving
	}
}

// tickNPCMovement advances one tick of the state machine for a single unit.
func tickNPCMovement(pos *instanceconfig.Position, b *instancestate.MovementState, mv instanceconfig.UnitMovement, speed, dt float64, rng *rand.Rand) {
	switch b.MovementPhase {

	case mobPhaseWaiting:
		b.WaitRemaining -= dt
		if b.WaitRemaining > 0 {
			return
		}
		npcBeginTurn(pos, b, mv, rng)

	case mobPhaseTurning:
		b.TurnElapsed += dt
		t := b.TurnElapsed / turnDuration
		if t > 1.0 {
			t = 1.0
		}
		pos.Angle = lerpAngleDeg(b.TurnStartAngle, b.TurnEndAngle, t)
		if t >= 1.0 {
			pos.Angle = b.TurnEndAngle
			b.PatrolStepIndex = b.PendingStepIndex
			b.MovementPhase = mobPhaseMoving
		}

	case mobPhaseMoving:
		dx := b.TargetX - pos.X
		dy := b.TargetY - pos.Y
		dist := math.Sqrt(dx*dx + dy*dy)
		move := speed * b.MoveRate * dt

		if dist <= move || dist < 0.01 {
			pos.X = b.TargetX
			pos.Y = b.TargetY
			npcArriveAtTarget(pos, b, mv, rng)
		} else {
			pos.X += (dx / dist) * move
			pos.Y += (dy / dist) * move
		}
	}
}

// npcBeginTurn starts a turning animation from the current facing toward (tx, ty).
// pendingStepIndex is the patrol step to apply when the turn completes.
func npcBeginTurn(pos *instanceconfig.Position, b *instancestate.MovementState, mv instanceconfig.UnitMovement, rng *rand.Rand) {
	var tx, ty, moveRate float64
	var pendingStep int

	switch mv.Type {
	case "patrol":
		pendingStep = nextPatrolStep(b, len(mv.Steps), mv.Choose, rng)
		step := mv.Steps[pendingStep]
		tx, ty = step.Position.X, step.Position.Y
		moveRate = step.MovementRate
	case "wander":
		if mv.Location == nil {
			return
		}
		tx, ty = randInCircle(mv.Location.X, mv.Location.Y, mv.Radius, rng)
		moveRate = sampleRangePtr(mv.Speed, 1.0, rng)
		pendingStep = b.PatrolStepIndex // wander doesn't use this, keep unchanged
	default:
		return
	}

	b.TargetX = tx
	b.TargetY = ty
	b.MoveRate = moveRate
	b.PendingStepIndex = pendingStep
	b.TurnStartAngle = pos.Angle
	b.TurnEndAngle = facingTowardDeg(pos.X, pos.Y, tx, ty)
	b.TurnElapsed = 0
	b.MovementPhase = mobPhaseTurning
}

// npcArriveAtTarget is called when a unit reaches its movement target.
// When wait == 0 it picks the next destination immediately (no turning phase).
// When wait > 0 it enters the waiting phase.
func npcArriveAtTarget(pos *instanceconfig.Position, b *instancestate.MovementState, mv instanceconfig.UnitMovement, rng *rand.Rand) {
	switch mv.Type {
	case "patrol":
		wait := sampleRange(mv.Steps[b.PatrolStepIndex].WaitTime, rng)
		if wait <= 0 {
			nextIdx := nextPatrolStep(b, len(mv.Steps), mv.Choose, rng)
			step := mv.Steps[nextIdx]
			pos.Angle = facingTowardDeg(pos.X, pos.Y, step.Position.X, step.Position.Y)
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
		wait := sampleRangePtr(mv.WaitTime, 0, rng)
		if wait <= 0 {
			tx, ty := randInCircle(mv.Location.X, mv.Location.Y, mv.Radius, rng)
			pos.Angle = facingTowardDeg(pos.X, pos.Y, tx, ty)
			b.TargetX = tx
			b.TargetY = ty
			b.MoveRate = sampleRangePtr(mv.Speed, 1.0, rng)
			// remain in mobPhaseMoving
		} else {
			b.WaitRemaining = wait
			b.MovementPhase = mobPhaseWaiting
		}
	}
}

// nextPatrolStep returns the next step index and updates PatrolDir for "return" mode.
func nextPatrolStep(b *instancestate.MovementState, n int, choose string, rng *rand.Rand) int {
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
		idx := rng.Intn(n - 1)
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
func randInCircle(cx, cy, r float64, rng *rand.Rand) (float64, float64) {
	angle := rng.Float64() * 2 * math.Pi
	dist := math.Sqrt(rng.Float64()) * r
	return cx + math.Cos(angle)*dist, cy + math.Sin(angle)*dist
}

// sampleRange samples a value uniformly from a ValueRange.
func sampleRange(vr instanceconfig.ValueRange, rng *rand.Rand) float64 {
	lo, hi := vr.Min(), vr.Max()
	if lo >= hi {
		return lo
	}
	return lo + rng.Float64()*(hi-lo)
}

// sampleRangePtr samples from a *ValueRange, returning def if the pointer is nil.
func sampleRangePtr(vr *instanceconfig.ValueRange, def float64, rng *rand.Rand) float64 {
	if vr == nil {
		return def
	}
	return sampleRange(*vr, rng)
}
