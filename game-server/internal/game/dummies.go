package game

import (
	"encoding/json"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// Training dummies: where they stand, what they tally, and sparring with them.

// placeDummies puts a world's training dummies on the layer, standing on the ground.
func (l *Layer) placeDummies() {
	if l.dummies != nil {
		return
	}
	l.dummies = []*dummy{}
	for i, d := range l.world.Dummies {
		at := [3]float64{d.At[0], 0, d.At[1]}
		if g := l.ground(d.Continent); g != nil {
			if s, ok, err := g.At(at[0], at[2]); ok && err == nil {
				at[1] = s.Ground
			}
		}
		id := int64(-1 - i) // characters' ids are positive
		made := &dummy{
			unit:  unit{ID: id, base: combat.Plain(dummyHealth), Health: dummyHealth, MaxHealth: dummyHealth, Statuses: map[statusKey]*activeStatus{}},
			state: Character{ID: id, Name: "Training Dummy", Look: json.RawMessage(`{"body":"goblin"}`), Continent: d.Continent, At: at, Move: Move{Gait: "run"}, Dummy: true, Health: dummyHealth, MaxHealth: dummyHealth},
		}
		made.char, made.dummy = &made.state, made
		l.dummies = append(l.dummies, made)
	}
}

func (l *Layer) dummiesOn(continent string) []Character {
	out := []Character{}
	for _, d := range l.dummies {
		if d.state.Continent == continent {
			out = append(out, l.seen(d.state))
		}
	}
	return out
}

// spar has the nearest dummy in reach swing back at a player who asked for that. It's how you try
// out what happens when you're hit, while nothing else in the world attacks. It can't kill you.
func (l *Layer) spar(p *Player, now time.Time) {
	f := &p.fight
	if !f.sparring || now.Before(f.sparAt) {
		return
	}
	var d *dummy
	for _, each := range l.dummies {
		if each.state.Continent == p.state.Continent && distance(p.state.At, each.state.At) <= combat.MeleeFt && (d == nil || distance(p.state.At, each.state.At) < distance(p.state.At, d.state.At)) {
			d = each
		}
	}
	if d == nil || !combat.CanSwing(l.controlsOn(&d.unit)) {
		return
	}
	f.sparAt = now.Add(seconds(combat.SwingSeconds))
	on := &f.unit
	l.tell(p, encode(swung{"swung", d.ID, p.ID()}))
	ctx := combat.HitContext{Schools: []string{"physical"}, Kinds: []string{"auto", "melee", "direct", "main", "single"}, Other: d.ID}
	h := hit{Type: "hit", From: d.ID, On: p.ID(), Effect: "damage"}
	theirs := l.statsOf(on, &ctx, now)
	front := facing(p.state.At, p.state.Yaw, d.state.At)
	if !l.avoided(on, d.ID, theirs, true, front, &ctx, &h, now) {
		n := theirs.Taken(on.MaxHealth*sparShare, ctx, f.level)
		blocked := combat.Blocks(theirs, true, front, l.hub.roll)
		if blocked {
			n *= 1 - combat.BlockShare
			h.Blocked = true
		}
		n = l.soak(on, n, ctx.Schools, &h, now)
		n = min(n, on.Health-1)
		l.harm(p, on, max(n, 0), &h, now)
		if blocked {
			l.fire(event{on: "block", who: on, other: d.ID, ctx: &ctx, amount: n}, now)
		}
		l.fire(event{on: "takeDamage", who: on, other: d.ID, ctx: &ctx, amount: n}, now)
	}
	l.showHit(p.ID(), on, h)
}

func (d *dummy) tally(n float64, now time.Time) {
	if d.firstHit.IsZero() {
		d.firstHit = now
	}
	d.lastHit, d.damage = now, d.damage+n
}

// dps is damage a second since the first hit, counting that first hit as a full second.
func (d *dummy) dps(now time.Time) float64 {
	return d.damage / max(1, now.Sub(d.firstHit).Seconds())
}

func (l *Layer) dummy(id int64, continent string) *dummy {
	for _, d := range l.dummies {
		if d.ID == id && (continent == "" || d.state.Continent == continent) {
			return d
		}
	}
	return nil
}
