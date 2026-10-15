// Package areashape is the geometry of a groundArea's footprint: circles,
// rings, lines and cones placed on a map. See docs/schema/power_effect.md.
package areashape

import "math"

const (
	Circle = "circle"
	Ring   = "ring"
	Line   = "line"
	Cone   = "cone"
)

// Shape is a footprint placed on a map: X, Y is its origin and Angle (degrees,
// measured from +y toward +x, like unit facing) the way a line or cone points.
// Which size fields matter depends on Kind.
type Shape struct {
	Kind        string  `json:"kind"`
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	Angle       float64 `json:"angle,omitempty"`
	Radius      float64 `json:"radius,omitempty"`      // circle
	InnerRadius float64 `json:"innerRadius,omitempty"` // ring
	OuterRadius float64 `json:"outerRadius,omitempty"` // ring
	Length      float64 `json:"length,omitempty"`      // line, cone
	Width       float64 `json:"width,omitempty"`       // line, cone (at its far end)
	Offset      float64 `json:"offset,omitempty"`      // cone: where its point starts
}

// Contains reports whether a unit of the given radius centered at (px, py)
// overlaps the shape: a unit's own radius counts, as it does for a splash.
func (s Shape) Contains(px, py, unitRadius float64) bool {
	dx, dy := px-s.X, py-s.Y
	switch s.Kind {
	case Circle:
		return math.Hypot(dx, dy) <= s.Radius+unitRadius
	case Ring:
		d := math.Hypot(dx, dy)
		return d <= s.OuterRadius+unitRadius && d >= s.InnerRadius-unitRadius
	case Line, Cone:
		rad := s.Angle * math.Pi / 180
		along := dx*math.Sin(rad) + dy*math.Cos(rad)
		across := math.Abs(dx*math.Cos(rad) - dy*math.Sin(rad))
		if s.Kind == Line {
			return along >= -unitRadius && along <= s.Length+unitRadius && across <= s.Width/2+unitRadius
		}
		return along >= s.Offset-unitRadius && along <= s.Length+unitRadius && across <= s.coneHalfWidth(along)+unitRadius
	}
	return false
}

// coneHalfWidth is the cone's half-width at distance along from its origin: a
// parabola, zero at Offset and Width/2 at Length.
func (s Shape) coneHalfWidth(along float64) float64 {
	span := s.Length - s.Offset
	if span <= 0 {
		return 0
	}
	t := math.Min(math.Max((along-s.Offset)/span, 0), 1)
	return s.Width / 2 * math.Sqrt(t)
}
