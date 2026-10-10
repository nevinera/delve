package mapfill

import (
	"fmt"
	"math"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// sideProbe is how far off a line connection OpenSide looks for open
// ground, in feet.
const sideProbe = 0.05

// ForZone computes each map's fill, keyed by map identifier, leaving out
// any map whose fill Check rejects - the game server treats those as
// having no fill rather than trapping units in it. rejected names each map
// left out and why.
func ForZone(zone instanceconfig.Zone) (fills map[string]*Fill, rejected map[string]error) {
	fills = make(map[string]*Fill, len(zone.Maps))
	rejected = map[string]error{}
	for _, m := range zone.Maps {
		f := Compute(m)
		if f == nil {
			continue
		}
		if err := f.Check(m); err != nil {
			rejected[m.Identifier] = err
			continue
		}
		fills[m.Identifier] = f
	}
	return fills, rejected
}

// Check applies the map validator's rule (app/services/validators/
// map_fill_validator.rb): the map has open ground, every line connection
// has it on exactly one side, and every point connection stands on it.
func (f *Fill) Check(m instanceconfig.Map) error {
	if !f.HasOpenGround() {
		return fmt.Errorf("map %q is filled everywhere", m.Identifier)
	}
	for _, c := range m.Connections {
		switch c.Type {
		case "line":
			if c.Start == nil || c.End == nil {
				continue
			}
			if _, _, ok := f.OpenSide(*c.Start, *c.End); !ok {
				return fmt.Errorf("connection %q doesn't have open ground on exactly one side", c.Identifier)
			}
		case "point":
			if c.Position != nil && f.Filled(c.Position.X, c.Position.Y) {
				return fmt.Errorf("connection %q is in the fill", c.Identifier)
			}
		}
	}
	return nil
}

// OpenSide returns the unit normal pointing from the line start→end into
// its open side, and false if it has open ground on both sides or neither.
func (f *Fill) OpenSide(start, end instanceconfig.Location) (nx, ny float64, ok bool) {
	dx, dy := end.X-start.X, end.Y-start.Y
	l := math.Hypot(dx, dy)
	if f == nil || l == 0 {
		return 0, 0, false
	}
	nx, ny = -dy/l, dx/l // left of start→end
	mx, my := (start.X+end.X)/2, (start.Y+end.Y)/2
	left := f.StateAt(mx+nx*sideProbe, my+ny*sideProbe) == Open
	right := f.StateAt(mx-nx*sideProbe, my-ny*sideProbe) == Open
	switch {
	case left && !right:
		return nx, ny, true
	case right && !left:
		return -nx, -ny, true
	}
	return 0, 0, false
}
