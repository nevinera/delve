package command

import (
	"math"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// Visibility is how well an observer sees a stealthed unit.
type Visibility string

const (
	VisibilityHidden Visibility = ""
	VisibilityFaint  Visibility = "faint"
	VisibilityFull   Visibility = "full"
)

// Detection tuning - see docs/schema/unit_type.md's Stealth.
const (
	stealthBaseRange     = 15.0 // feet of full detection at an even rating gap
	stealthRangePerPoint = 0.5  // feet per point of rating gap
	stealthFaintFactor   = 1.6  // the faint band reaches this far past full range
	stealthRearFactor    = 1.0 / 3
	stealthPointBlank    = 5.0 // always fully visible within this many feet
)

// StealthVisibility is how well observer sees unit. A unit that isn't
// stealthed is always fully visible; a stealthed one is detected through the
// observer's facing, by the gap between the observer's detection and the
// unit's stealth, plus the gap in their elevations (see CombatStats.Elvl).
func StealthVisibility(observer, unit *instancestate.UnitState, zone instanceconfig.Zone) Visibility {
	if !unit.Stealthed {
		return VisibilityFull
	}
	if observer.MapIdentifier != unit.MapIdentifier {
		return VisibilityHidden
	}
	dx := unit.Position.X - observer.Position.X
	dy := unit.Position.Y - observer.Position.Y
	dist := math.Hypot(dx, dy) - unit.Radius
	if dist <= stealthPointBlank {
		return VisibilityFull
	}
	full := math.Max(0, stealthBaseRange+ratingGap(observer, unit, zone)*stealthRangePerPoint)
	if !inFront(observer.Position.Angle, dx, dy) {
		full *= stealthRearFactor
	}
	switch {
	case dist <= full:
		return VisibilityFull
	case dist <= full*stealthFaintFactor:
		return VisibilityFaint
	default:
		return VisibilityHidden
	}
}

// CanSee reports whether observer detects target at all (fully or faintly):
// a player can only attack or cast at a stealthed unit they detect. Area
// effects don't ask.
func CanSee(observer, target *instancestate.UnitState, zone instanceconfig.Zone) bool {
	return StealthVisibility(observer, target, zone) != VisibilityHidden
}

// ratingGap is detection minus stealth, plus how far the observer's
// elevation sits above the unit's.
func ratingGap(observer, unit *instancestate.UnitState, zone instanceconfig.Zone) float64 {
	return detectionRating(observer, zone) - stealthRating(unit, zone) + elvl(observer, zone) - elvl(unit, zone)
}

// detectionRating is an NPC's unit-type detection. Players have none yet
// (class passives will add it).
func detectionRating(u *instancestate.UnitState, zone instanceconfig.Zone) float64 {
	if ut, ok := zone.UnitTypes[u.UnitTypeIdentifier]; ok {
		return ut.Detection
	}
	return 0
}

func stealthRating(u *instancestate.UnitState, zone instanceconfig.Zone) float64 {
	if ut, ok := zone.UnitTypes[u.UnitTypeIdentifier]; ok && ut.Stealth != nil {
		return *ut.Stealth
	}
	return 0
}

func elvl(u *instancestate.UnitState, zone instanceconfig.Zone) float64 {
	if u.CombatStats != nil {
		return u.CombatStats.Elvl
	}
	return unitElvl(u, zone)
}

// inFront reports whether the offset (dx, dy) lies in the front half of a
// facing angle (clockwise degrees from north).
func inFront(angle, dx, dy float64) bool {
	rad := angle * math.Pi / 180
	return math.Sin(rad)*dx+math.Cos(rad)*dy >= 0
}
