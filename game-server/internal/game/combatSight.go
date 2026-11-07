package game

import (
	"log"
	"time"
)

// Whether abilities can see what they're on, and answering clients that ask.

// sees is whether someone with their feet at from can see what has its feet at to. With no ground
// to go by, or trouble reading it, nothing's in the way.
func (cm *Combat) sees(continent string, from, to [3]float64) bool {
	g := cm.state.ground(continent)
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
func (cm *Combat) feetOf(id int64) ([3]float64, bool) {
	if u := cm.state.unit(id, ""); u != nil {
		return u.char.At, true
	}
	return [3]float64{}, false
}

// seesCast is whether the caster can still see what a cast is on.
func (cm *Combat) seesCast(u *unit, c *casting) bool {
	if c.spot != nil {
		return cm.sees(u.char.Continent, u.char.At, *c.spot)
	}
	if c.target == 0 || c.target == u.ID {
		return true
	}
	at, here := cm.feetOf(c.target)
	return !here || cm.sees(u.char.Continent, u.char.At, at)
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
	at, here := l.combat.feetOf(target)
	if !here || p.seesAsked >= maxSeesPerSecond || distance(p.state.At, at) > seesReachFt {
		return
	}
	p.seesAsked++
	p.send(encode(seesAnswer{"sees", target, l.combat.sees(p.state.Continent, p.state.At, at)}))
}

// seesFromFront says whether a unit is facing what's at `from`.
func (cm *Combat) seesFromFront(on *unit, from [3]float64) bool {
	if cm.state.unit(on.ID, "") != on {
		return true
	}
	return facing(on.char.At, on.char.Yaw, from)
}
