package game

import (
	"encoding/json"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// Mobs: where they stand, and training dummies' tallies and sparring.

// placeMobs puts a world's training dummies and the creatures placed in its spawns files on the
// layer, standing on the ground. Mobs' ids are negative, as characters' are positive.
func (l *Layer) placeMobs() {
	if l.mobs != nil {
		return
	}
	l.mobs = []*mob{}
	for _, d := range l.world.Dummies {
		id := int64(-1 - len(l.mobs))
		at := l.onGround(d.Continent, d.At[0], d.At[1])
		made := &mob{
			unit:     unit{ID: id, base: combat.Plain(dummyHealth), Health: dummyHealth, MaxHealth: dummyHealth, Statuses: map[statusKey]*activeStatus{}},
			training: true,
			state:    Character{ID: id, Name: "Training Dummy", Look: json.RawMessage(`{"body":"goblin"}`), Continent: d.Continent, At: at, Move: Move{Gait: "run"}, Dummy: true, Health: dummyHealth, MaxHealth: dummyHealth},
		}
		made.char, made.mob = &made.state, made
		l.mobs = append(l.mobs, made)
	}
	for _, p := range l.world.Placed {
		l.mobs = append(l.mobs, l.placed(int64(-1-len(l.mobs)), p))
	}
}

// onGround is the place at (x, z) on a continent, on the ground there if the layer knows it.
func (l *Layer) onGround(continent string, x, z float64) [3]float64 {
	at := [3]float64{x, 0, z}
	if g := l.ground(continent); g != nil {
		if s, ok, err := g.At(x, z); ok && err == nil {
			at[1] = s.Ground
		}
	}
	return at
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
	cm.mobSwing(d, &f.unit, f.unit.MaxHealth*sparShare, now)
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
