// Package itemstats computes an item's stat grants from its slot/elvl/
// primary/secondaries allocation, per docs/stats.md. Mirrors the Rails
// ItemStats module (app/services/item_stats/) - keep the two in sync.
package itemstats

import "math"

// ElevationMultiplier converts effective elevation (ee = item elvl - map
// elvl) into the elevation multiplier (em) used to scale item stats.
func ElevationMultiplier(ee float64) float64 {
	return elevationBase(ee) * elevationTaper(ee)
}

func elevationBase(ee float64) float64 {
	return 2.0 / (1 + math.Pow(3.0, -ee/10.0))
}

func elevationTaper(ee float64) float64 {
	switch {
	case math.Abs(ee) <= 10:
		return 1.0
	case ee >= -20 && ee < -10:
		return (ee + 20) / 10.0
	case ee > 10 && ee <= 20:
		return 1 + (ee-10)/90.0
	case ee < -20:
		return 0.0
	default:
		return 10.0 / 9
	}
}
