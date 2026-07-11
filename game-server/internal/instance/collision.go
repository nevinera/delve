package instance

import (
	"math"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

const wallHalfThickness = 0.2 // feet; half the rendered wall thickness

// resolveCollisions pushes all units with Radius > 0 out of any barriers on
// their current map. Called after applyMovement each tick.
func resolveCollisions(state *instancestate.InstanceState, zone instanceconfig.Zone) {
	barriersByMap := make(map[string][]instanceconfig.Barrier, len(zone.Maps))
	dimsByMap := make(map[string]instanceconfig.Dimensions, len(zone.Maps))
	for _, m := range zone.Maps {
		barriersByMap[m.Identifier] = m.Barriers
		dimsByMap[m.Identifier] = m.FeetDimensions
	}

	for _, unit := range state.Units {
		if unit.Radius == 0 {
			continue
		}
		x, y := unit.Position.X, unit.Position.Y
		for _, b := range barriersByMap[unit.MapIdentifier] {
			switch b.Type {
			case "wall":
				locs := b.Locations
				for i := 0; i < len(locs)-1; i++ {
					x, y = pushOutOfSegment(x, y, unit.Radius+wallHalfThickness,
						locs[i].X, locs[i].Y, locs[i+1].X, locs[i+1].Y)
				}
			case "circle":
				if b.Location == nil {
					continue
				}
				x, y = pushOutOfCircle(x, y, unit.Radius, b.Location.X, b.Location.Y, b.Radius)
			}
		}
		if d := dimsByMap[unit.MapIdentifier]; d.Width > 0 {
			r := unit.Radius
			x = math.Max(r, math.Min(d.Width-r, x))
			y = math.Max(r, math.Min(d.Height-r, y))
		}
		unit.Position.X, unit.Position.Y = x, y
	}
}

// pushOutOfSegment returns (px, py) pushed outside radius r of the closest
// point on segment (ax,ay)→(bx,by). Returns (px,py) unchanged if no overlap.
func pushOutOfSegment(px, py, r, ax, ay, bx, by float64) (float64, float64) {
	dx, dy := bx-ax, by-ay
	lenSq := dx*dx + dy*dy
	if lenSq == 0 {
		return px, py
	}
	t := ((px-ax)*dx + (py-ay)*dy) / lenSq
	if t < 0 {
		t = 0
	} else if t > 1 {
		t = 1
	}
	cx, cy := ax+t*dx, ay+t*dy
	ex, ey := px-cx, py-cy
	dist := math.Sqrt(ex*ex + ey*ey)
	if dist >= r {
		return px, py
	}
	if dist == 0 {
		// Degenerate: push perpendicular to segment direction
		segLen := math.Sqrt(lenSq)
		return px + (-dy/segLen)*r, py + (dx/segLen)*r
	}
	overlap := r - dist
	return px + (ex/dist)*overlap, py + (ey/dist)*overlap
}

// pushOutOfCircle returns (px, py) pushed outside (unitRadius + barrierRadius)
// of the barrier center (cx, cy). Returns (px, py) unchanged if no overlap.
func pushOutOfCircle(px, py, unitRadius, cx, cy, barrierRadius float64) (float64, float64) {
	dx, dy := px-cx, py-cy
	dist := math.Sqrt(dx*dx + dy*dy)
	minDist := unitRadius + barrierRadius
	if dist >= minDist {
		return px, py
	}
	if dist == 0 {
		return px, py + minDist
	}
	overlap := minDist - dist
	return px + (dx/dist)*overlap, py + (dy/dist)*overlap
}
