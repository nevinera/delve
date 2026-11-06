package worlds

import "math"

// The faces the ground and caves' floors are walked as, as client/src/v2/faces.js has them: each
// square of a grid of corner heights is two flat triangles, split from its northeast corner to its
// southwest, the northwest one where fu + fv <= 1. fu and fv run 0 to 1 across the square, east
// and south.

// faceHeight is the height at (fu, fv) on a square with these corners' heights.
func faceHeight(nw, ne, sw, se, fu, fv float64) float64 {
	if fu+fv <= 1 {
		return nw + (ne-nw)*fu + (sw-nw)*fv
	}
	return se + (sw-se)*(1-fu) + (ne-se)*(1-fv)
}

// faceSlope is how steep the triangle (fu, fv) is in, rise over run, on a square `width` across.
func faceSlope(nw, ne, sw, se, fu, fv, width float64) float64 {
	if fu+fv <= 1 {
		return math.Hypot(ne-nw, sw-nw) / width
	}
	return math.Hypot(se-sw, se-ne) / width
}
