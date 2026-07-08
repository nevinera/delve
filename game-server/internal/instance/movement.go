package instance

import (
	"math"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

// BasePlayerSpeed is the default movement speed in feet per second.
// Exported so spawn.go and tests can reference it without duplication.
// Will be driven by class stats and buffs in the future.
const BasePlayerSpeed = 20.0

// applyMovement advances position for all units with an active MovementIntent.
// Called each tick after commands are processed.
func applyMovement(state *instancestate.InstanceState) {
	dt := TickInterval.Seconds()
	for _, unit := range state.Units {
		intent := unit.MovementIntent
		if !intent.Forward && !intent.Backward && !intent.StrafeLeft && !intent.StrafeRight {
			continue
		}

		angleRad := unit.Position.Angle * math.Pi / 180.0
		sinA, cosA := math.Sin(angleRad), math.Cos(angleRad)

		// X = east, Y = north, Angle = clockwise degrees from north.
		// Forward:      (sin, cos)
		// StrafeRight:  (cos, -sin)
		var dx, dy float64
		if intent.Forward {
			dx += sinA
			dy += cosA
		}
		if intent.Backward {
			dx -= sinA
			dy -= cosA
		}
		if intent.StrafeRight {
			dx += cosA
			dy -= sinA
		}
		if intent.StrafeLeft {
			dx -= cosA
			dy += sinA
		}

		mag := math.Sqrt(dx*dx + dy*dy)
		if mag == 0 {
			continue // opposing keys cancelled out
		}

		speed := unit.Speed
		if speed == 0 {
			speed = BasePlayerSpeed
		}
		dist := speed * dt / mag
		unit.Position.X += dx * dist
		unit.Position.Y += dy * dist
	}
}
