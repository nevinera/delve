package command

import (
	"math"
	"time"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

// pushbackBaseSeconds is how much a currently-casting unit's first landed
// hit taken pushes its cast back - see ApplyCastPushback.
const pushbackBaseSeconds = 0.5

// ApplyCastPushback extends target's in-progress cast (if any) by this
// hit's pushback amount - halving each successive hit against the same
// cast (0.5s, 0.25s, 0.125s, ...), asymptotically approaching +1s of total
// pushback as hits keep landing rather than hard-capping at a fixed hit
// count (real WoW's own mechanic caps at the first two hits - this is a
// deliberate departure, so a crowd of attackers keeps slowing a cast down
// instead of every hit past the second doing nothing). No-op if target
// isn't currently casting. Only call this for a hit that actually landed
// (a miss doesn't push back) - callers already compute that.
func ApplyCastPushback(target *instancestate.UnitState) {
	if target.Casting == nil {
		return
	}
	extension := pushbackBaseSeconds / math.Pow(2, float64(target.Casting.PushbackHits))
	target.Casting.EndsAt = target.Casting.EndsAt.Add(time.Duration(extension * float64(time.Second)))
	target.Casting.PushbackHits++
}
