package game

import (
	"log"
	"time"
)

// Whether abilities can see what they're on, and answering clients that ask.

// sees is whether someone with their feet at from can see what has its feet at to. With no ground
// to go by, or trouble reading it, nothing's in the way.
func (l *Layer) sees(continent string, from, to [3]float64) bool {
	g := l.ground(continent)
	if g == nil {
		return true
	}
	clear, err := g.Sees(from, to)
	if err != nil {
		log.Printf("line of sight on %s: %v", continent, err)
		return true
	}
	return clear
}

// feetOf is where a unit's feet are, if it's here.
func (l *Layer) feetOf(id int64) ([3]float64, bool) {
	if d := l.dummy(id, ""); d != nil {
		return d.state.At, true
	}
	if o := l.players[id]; o != nil {
		return o.state.At, true
	}
	return [3]float64{}, false
}

// seesCast is whether the caster can still see what a cast is on.
func (l *Layer) seesCast(p *Player, c *casting) bool {
	if c.spot != nil {
		return l.sees(p.state.Continent, p.state.At, *c.spot)
	}
	if c.target == 0 || c.target == p.ID() {
		return true
	}
	at, here := l.feetOf(c.target)
	return !here || l.sees(p.state.Continent, p.state.At, at)
}

// answerSees tells the player whether the server has them seeing a unit, for the line of sight
// overlay, as often as maxSeesPerSecond.
func (l *Layer) answerSees(p *Player, target int64) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.hub.now()
	if now.Sub(p.seesFrom) >= time.Second {
		p.seesFrom, p.seesAsked = now, 0
	}
	at, here := l.feetOf(target)
	if !here || p.seesAsked >= maxSeesPerSecond || distance(p.state.At, at) > seesReachFt {
		return
	}
	p.seesAsked++
	p.send(encode(seesAnswer{"sees", target, l.sees(p.state.Continent, p.state.At, at)}))
}

// seesFromFront says whether a unit is facing what's at `from`.
func (l *Layer) seesFromFront(on *vitals, from [3]float64) bool {
	if o := l.players[on.ID]; o != nil {
		return facing(o.state.At, o.state.Yaw, from)
	}
	if d := l.dummy(on.ID, ""); d != nil {
		return facing(d.state.At, d.state.Yaw, from)
	}
	return true
}
