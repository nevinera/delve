package game

import (
	"iter"
	"math"
	"time"
)

// unit is the unit with that id on `continent`, or on any continent with "", or nil: a training
// dummy, or a player on the layer.
func (l *Layer) unit(id int64, continent string) *unit {
	if d := l.dummy(id, continent); d != nil {
		return &d.unit
	}
	if o := l.players[id]; o != nil && (continent == "" || o.state.Continent == continent) {
		return &o.fight.unit
	}
	return nil
}

// units goes over every unit on the layer, the dummies first.
func (l *Layer) units() iter.Seq[*unit] {
	return func(yield func(*unit) bool) {
		for _, d := range l.dummies {
			if !yield(&d.unit) {
				return
			}
		}
		for _, o := range l.players {
			if !yield(&o.fight.unit) {
				return
			}
		}
	}
}

// caster is the unit of the player with that id on the layer, or nil: what put a status on, or
// keeps an area going.
func (l *Layer) caster(id int64) *unit {
	if o := l.players[id]; o != nil {
		return &o.fight.unit
	}
	return nil
}

// playerOf is the player a unit is, while it's on the layer, or nil.
func (l *Layer) playerOf(u *unit) *Player {
	if u == nil || u.player == nil || l.players[u.ID] != u.player {
		return nil
	}
	return u.player
}

// setHealth puts a unit's health at n, kept between none and its most, where those arriving will
// see it. What did it says so, as a hit (showHit).
func (l *Layer) setHealth(u *unit, n float64) {
	u.Health = min(max(n, 0), u.MaxHealth)
	u.char.Health, u.char.MaxHealth = u.Health, u.MaxHealth
}

// resizeHealth gives a unit `most` health at most and `n` now, and says so.
func (l *Layer) resizeHealth(u *unit, n, most float64) {
	u.MaxHealth = most
	l.setHealth(u, n)
	l.tellOf(u.ID, encode(healthMessage{"health", u.ID, math.Round(u.Health), u.MaxHealth}))
}

// showHit tells those near `near` what landed on `on`, with its health as it is now.
func (l *Layer) showHit(near int64, on *unit, h hit) {
	h.Health, h.MaxHealth = math.Round(on.Health), on.MaxHealth
	l.tellOf(near, encode(h))
}

// addStatus puts a status on a unit, in place of any copy from the same unit, and says so.
func (l *Layer) addStatus(on *unit, key statusKey, held *activeStatus, now time.Time) {
	on.Statuses[key] = held
	l.tellOf(on.ID, encode(statusOn{"statusOn", on.ID, shownOf(key, held, now)}))
}

// removeStatus takes a status off a unit, ending its auras, and says so. It returns what was held,
// or nil.
func (l *Layer) removeStatus(on *unit, key statusKey) *activeStatus {
	held := on.Statuses[key]
	delete(on.Statuses, key)
	if held != nil {
		l.endZones(held)
	}
	l.tellOf(on.ID, encode(statusGone{"statusGone", on.ID, key.id, key.from}))
	return held
}

// debugLine logs a line about what a player's abilities come to, if it asked for that.
func (u *unit) debugLine(format string, args ...any) {
	if u.player != nil {
		u.player.debugLine(format, args...)
	}
}

// send sends a message to the player a unit is, if it is one.
func (u *unit) send(b []byte) {
	if u.player != nil {
		u.player.send(b)
	}
}
