package game

import (
	"encoding/json"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// Training dummies: where they stand, what they tally, and sparring with them.

// placeDummies puts a world's training dummies on the layer, standing on the ground.
func (l *Layer) placeDummies() {
	if l.mobs != nil {
		return
	}
	l.mobs = []*mob{}
	for i, d := range l.world.Dummies {
		at := [3]float64{d.At[0], 0, d.At[1]}
		if g := l.ground(d.Continent); g != nil {
			if s, ok, err := g.At(at[0], at[2]); ok && err == nil {
				at[1] = s.Ground
			}
		}
		id := int64(-1 - i) // characters' ids are positive
		made := &mob{
			unit:     unit{ID: id, base: combat.Plain(dummyHealth), Health: dummyHealth, MaxHealth: dummyHealth, Statuses: map[statusKey]*activeStatus{}},
			training: true,
			state:    Character{ID: id, Name: "Training Dummy", Look: json.RawMessage(`{"body":"goblin"}`), Continent: d.Continent, At: at, Move: Move{Gait: "run"}, Dummy: true, Health: dummyHealth, MaxHealth: dummyHealth},
		}
		made.char, made.mob = &made.state, made
		l.mobs = append(l.mobs, made)
	}
}

func (l *Layer) mobsOn(continent string) []Character {
	out := []Character{}
	for _, d := range l.mobs {
		if d.state.Continent == continent {
			out = append(out, l.seen(d.state))
		}
	}
	return out
}

// spar has the nearest training dummy in reach swing back at a player who asked for that. It's how you try
// out what happens when you're hit, while nothing else in the world attacks. It can't kill you.
func (cm *Combat) spar(u *unit, now time.Time) {
	f := u.fight
	if !f.sparring || now.Before(f.sparAt) {
		return
	}
	var d *mob
	for _, each := range cm.state.mobList() {
		if each.training && each.state.Continent == u.char.Continent && distance(u.char.At, each.state.At) <= combat.MeleeFt && (d == nil || distance(u.char.At, each.state.At) < distance(u.char.At, d.state.At)) {
			d = each
		}
	}
	if d == nil || !combat.CanSwing(cm.controlsOn(&d.unit)) {
		return
	}
	f.sparAt = now.Add(seconds(combat.SwingSeconds))
	on := &f.unit
	cm.state.tellOf(u.ID, encode(swung{"swung", d.ID, u.ID}))
	ctx := combat.HitContext{Schools: []string{"physical"}, Kinds: []string{"auto", "melee", "direct", "main", "single"}, Other: d.ID}
	h := hit{Type: "hit", From: d.ID, On: u.ID, Effect: "damage"}
	theirs := cm.statsOf(on, &ctx, now)
	front := facing(u.char.At, u.char.Yaw, d.state.At)
	if !cm.avoided(on, d.ID, theirs, true, front, &ctx, &h, now) {
		n := theirs.Taken(on.MaxHealth*sparShare, ctx, f.level)
		blocked := combat.Blocks(theirs, true, front, cm.roll)
		if blocked {
			n *= 1 - combat.BlockShare
			h.Blocked = true
		}
		n = cm.soak(on, n, ctx.Schools, &h, now)
		n = min(n, on.Health-1)
		cm.harm(u, on, max(n, 0), &h, now)
		if blocked {
			cm.fire(event{on: "block", who: on, other: d.ID, ctx: &ctx, amount: n}, now)
		}
		cm.fire(event{on: "takeDamage", who: on, other: d.ID, ctx: &ctx, amount: n}, now)
	}
	cm.state.showHit(u.ID, on, h)
}

func (d *mob) tally(n float64, now time.Time) {
	if d.firstHit.IsZero() {
		d.firstHit = now
	}
	d.lastHit, d.damage = now, d.damage+n
}

// dps is damage a second since the first hit, counting that first hit as a full second.
func (d *mob) dps(now time.Time) float64 {
	return d.damage / max(1, now.Sub(d.firstHit).Seconds())
}

func (l *Layer) mob(id int64, continent string) *mob {
	for _, d := range l.mobs {
		if d.ID == id && (continent == "" || d.state.Continent == continent) {
			return d
		}
	}
	return nil
}
