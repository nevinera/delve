package game

import (
	"log"
	"math"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

const (
	moveStopFt  = 5.0 // how far short of a unit a move stops
	behindFt    = 3.0 // how far behind a unit `behind` puts you
	moveStepFt  = 1.0 // how often a move looks at the ground on its way
	moveStandFt = 4.0 // how far above its feet a move can find something to stand on
	leastArc    = 0.4 // the fewest seconds a move through the air takes
)

// moveKind is how each kind of `move` goes when the effect doesn't say.
type moveKind struct {
	distance, speed, height float64
	flies                   bool // it goes over what's in the way
}

var moveKinds = map[string]moveKind{
	"charge":    {speed: 60},
	"leap":      {speed: 40, height: 10, flies: true},
	"knockback": {distance: 15, speed: 30, height: 5},
	"pull":      {speed: 40},
	"blink":     {distance: 20},
	"dash":      {distance: 20, speed: 40},
	"leapBack":  {distance: 15, speed: 30, height: 8, flies: true},
	"knockup":   {height: 10, flies: true},
	"behind":    {flies: true},
}

// forceMove does a `move` effect. The server puts the character where it ends straight away, and the
// clients play the trip. Training dummies stay put.
func (cm *Combat) forceMove(u *unit, c *casting, e *combat.Effect, on *unit, now time.Time) {
	o := cm.state.playerUnit(on)
	if o == nil {
		u.debugLine("%s: %s stays put", c.ability.Name, cm.nameOf(on.ID))
		return
	}
	kind, known := moveKinds[e.Kind]
	if !known {
		log.Printf("character %d: ability %s has a move of a kind there isn't: %q", u.ID, c.ability.ID, e.Kind)
		return
	}
	if (e.Kind == "knockback" || e.Kind == "pull") && o != u && cm.immuneTo(on, e.Kind, now) {
		u.debugLine("%s: %s is immune", c.ability.Name, cm.nameOf(on.ID))
		return
	}
	to, yaw, ok := cm.moveEnd(u, c, e, o, kind)
	if !ok {
		u.debugLine("%s: nowhere for %s to go", c.ability.Name, cm.nameOf(on.ID))
		return
	}
	from := o.char.At
	end := stoppingAt(cm.state.ground(o.char.Continent), from, to, kind.flies || e.Flying)
	height := kind.height
	if e.Height > 0 {
		height = e.Height
	}
	speed := kind.speed
	if e.Speed > 0 {
		speed = e.Speed
	}
	lasts := 0.0
	if speed > 0 {
		lasts = horizontal(from, end) / speed
	}
	if height > 0 {
		lasts = max(lasts, leastArc)
	}
	if o.fight.cast != nil && o.fight.cast != c {
		cm.stopCast(on)
	}
	o.char.Yaw = yaw
	cm.breakStatuses(on, "move", nil)
	cm.state.motionOf(o).teleported(now.Add(seconds(lasts)))
	said := encode(forced{"forced", o.ID, e.Kind, from, end, yaw, lasts, height})
	cm.state.relocate(on, o.char.Continent, end, said, said)
	u.debugLine("%s: %s moves %.0f ft in %.1f s", c.ability.Name, cm.nameOf(on.ID), distance(from, end), lasts)
}

// moveEnd is where a move means to put a character, before the ground has its say, and which way
// it faces after.
func (cm *Combat) moveEnd(u *unit, c *casting, e *combat.Effect, o *unit, kind moveKind) ([3]float64, float64, bool) {
	from, yaw := o.char.At, o.char.Yaw
	reach := kind.distance
	if e.Distance > 0 {
		reach = e.Distance
	}
	unit := func(id int64) ([3]float64, float64, bool) {
		if t := cm.state.unit(id, o.char.Continent); t != nil {
			return t.char.At, t.char.Yaw, true
		}
		return from, 0, false
	}
	ahead := func(sign float64) ([3]float64, float64, bool) {
		return [3]float64{from[0] + sign*math.Sin(yaw)*reach, from[1], from[2] + sign*math.Cos(yaw)*reach}, yaw, true
	}
	// Toward a point, stopping short of it if it's a unit, and facing it.
	toward := func(at [3]float64, stop float64) ([3]float64, float64, bool) {
		gap := horizontal(from, at)
		if gap == 0 {
			return from, yaw, true
		}
		share := max(gap-stop, 0) / gap
		end := [3]float64{from[0] + (at[0]-from[0])*share, at[1], from[2] + (at[2]-from[2])*share}
		return end, math.Atan2(at[0]-from[0], at[2]-from[2]), true
	}
	where := e.To
	if where == "" {
		switch e.Kind {
		case "pull":
			where = "self"
		case "charge", "leap", "behind":
			where = "target"
			if c.spot != nil && c.ability.Target == "ground" {
				where = "ground"
			}
		}
	}
	switch where {
	case "ground":
		if c.spot == nil {
			return from, yaw, false
		}
		return toward(*c.spot, 0)
	case "self":
		if o == u {
			return from, yaw, false
		}
		return toward(u.char.At, moveStopFt)
	case "target":
		at, targetYaw, ok := unit(c.target)
		if !ok {
			return from, yaw, false
		}
		if e.Kind == "behind" {
			end := [3]float64{at[0] - math.Sin(targetYaw)*behindFt, at[1], at[2] - math.Cos(targetYaw)*behindFt}
			return end, targetYaw, true
		}
		return toward(at, moveStopFt)
	}
	switch e.Kind {
	case "dash", "blink":
		return ahead(1)
	case "leapBack":
		return ahead(-1)
	case "knockup":
		return from, yaw, true
	case "knockback":
		away := u.char.At
		gap := horizontal(away, from)
		if o == u || gap == 0 {
			return ahead(-1)
		}
		return [3]float64{from[0] + (from[0]-away[0])/gap*reach, from[1], from[2] + (from[2]-away[2])/gap*reach}, yaw, true
	}
	return from, yaw, false
}

// stoppingAt is how far along the straight line from a to b a move gets: to the edge of the land,
// and unless it flies, to the foot of anything too steep to walk up or the side of a slab. The end
// is on whatever's there to stand on.
func stoppingAt(g Ground, a, b [3]float64, flies bool) [3]float64 {
	if g == nil {
		return b
	}
	gap := horizontal(a, b)
	steps := max(int(math.Ceil(gap/moveStepFt)), 1)
	at := a
	for i := 1; i <= steps; i++ {
		u := float64(i) / float64(steps)
		x, z := a[0]+(b[0]-a[0])*u, a[2]+(b[2]-a[2])*u
		s, ok, err := g.At(x, z)
		if err != nil {
			log.Printf("movement: reading the ground: %v", err)
			return at
		}
		if !ok {
			return at
		}
		feet := at[1]
		if flies {
			feet = max(a[1], b[1])
		}
		next := [3]float64{x, standingOn(s, feet), z}
		if !flies {
			step := horizontal(at, next)
			if next[1]-at[1] > step*slopeRise+1 {
				return at
			}
			if into, err := g.Enters(at, next); err == nil && into != "" {
				return at
			}
		}
		at = next
	}
	return at
}

// standingOn is the height a character comes down on there, from feet at this height: the highest
// thing to stand on not far above them, or else the lowest there is.
func standingOn(s worlds.Sample, feet float64) float64 {
	if at, _, ok := s.Stand(feet, moveStandFt); ok {
		return at
	}
	return feet
}

// relocate puts a player somewhere else. It hears `own`. Those near it before and after hear `seen`,
// and those it's come near or left see it come and go, and it them.
func (l *Layer) relocate(u *unit, continent string, at [3]float64, own, seen []byte) {
	before := map[int64]*Player{}
	for _, o := range l.near(u.player) {
		before[o.ID()] = o
	}
	wasOn, was := u.char.Continent, u.char.At
	u.char.Continent, u.char.At, u.char.Move = continent, at, Move{Gait: "run"}
	l.save(u.player)
	u.send(own)
	for _, o := range l.near(u.player) {
		if before[o.ID()] != nil {
			delete(before, o.ID())
			o.send(seen)
			continue
		}
		o.send(encode(appear{"appear", l.seen(*u.char)}))
		u.send(encode(appear{"appear", l.seen(o.state)}))
	}
	for _, o := range before {
		o.send(encode(vanish{"vanish", u.ID}))
		u.send(encode(vanish{"vanish", o.ID()}))
	}
	l.showMobs(u.player, wasOn, was)
}
