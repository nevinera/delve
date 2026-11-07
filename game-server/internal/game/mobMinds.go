package game

import (
	"math"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// What placed mobs do on their own: wander near home, notice players, chase and fight them, and go
// home when led too far. Numbers here are placeholders until mobs' numbers are worked out.

const (
	aggroFt       = 60.0  // how near a hostile mob notices you, when its creature doesn't say
	leashFt       = 150.0 // how far from home a mob follows before it gives up
	wanderFt      = 30.0  // how far from home a mob wanders, when its placing doesn't say
	wanderEvery   = 8.0   // seconds between wanders, at least
	mobSwing      = 2.0   // seconds between swings, when its creature doesn't say
	homeSpeedup   = 1.5   // how much faster a mob runs home than it chases
	sayMovesEvery = 500 * time.Millisecond
)

// mind is what a placed mob is doing.
type mind struct {
	mode     string // "" (at peace), "fight" or "home"
	target   int64
	swingAt  time.Time
	wanderAt time.Time
	goal     *[3]float64 // where it's wandering to
	saidAt   time.Time   // when those near last heard how it's moving
}

// think moves a placed mob on by dt seconds.
func (cm *Combat) think(m *mob, dt float64, now time.Time) {
	if m.training || m.creature == nil || m.char.Dead {
		return
	}
	if m.mind.mode == "" && !cm.watched(m) {
		return // at peace with no one near, it waits
	}
	switch m.mind.mode {
	case "home":
		if cm.walk(m, m.home, runFt*m.speed()*homeSpeedup, 0, "run", dt, now) {
			cm.state.resizeHealth(&m.unit, m.MaxHealth, m.MaxHealth)
			m.mind = mind{wanderAt: now.Add(seconds(wanderEvery))}
		}
	case "fight":
		t := cm.state.unit(m.mind.target, m.char.Continent)
		if t == nil || !cm.state.present(t) || t.Health <= 0 || distance(m.char.At, m.home) > leashFt {
			cm.giveUp(m, now)
			return
		}
		reach := m.reach()
		if distance(m.char.At, t.char.At) > reach {
			cm.walk(m, t.char.At, runFt*m.speed(), reach*0.8, "run", dt, now)
			return
		}
		yaw := math.Atan2(t.char.At[0]-m.char.At[0], t.char.At[2]-m.char.At[2])
		cm.say(m, m.char.At, yaw, Move{Gait: "run"}, now)
		if !now.Before(m.mind.swingAt) && combat.CanSwing(cm.controlsOn(&m.unit)) {
			every := m.creature.Attack.Speed
			if every <= 0 {
				every = mobSwing
			}
			m.mind.swingAt = now.Add(seconds(every))
			cm.mobSwing(m, t, m.swingDamage(), now)
		}
	default:
		if t := cm.noticed(m); t != nil {
			cm.engage(m, t, now)
			return
		}
		cm.wander(m, dt, now)
	}
}

// engage has a mob at peace fight a unit, as it noticed or was hit by it.
func (cm *Combat) engage(m *mob, t *unit, now time.Time) {
	if m.training || m.creature == nil || m.char.Dead || m.mind.mode != "" || !cm.state.present(t) {
		return
	}
	m.mind = mind{mode: "fight", target: t.ID, swingAt: now}
}

// giveUp sends a mob home: it can't be hurt or targeted on its way, and heals when it gets there.
func (cm *Combat) giveUp(m *mob, now time.Time) {
	m.mind = mind{mode: "home"}
	for key := range m.Statuses {
		cm.state.removeStatus(&m.unit, key)
	}
	for u := range cm.state.playerUnits() {
		if u.fight.attacking == m.ID {
			cm.stopAttacking(u)
		}
	}
}

// noticed is the nearest player a hostile mob can see within its aggro radius, or nil.
func (cm *Combat) noticed(m *mob) *unit {
	if m.creature.Reaction == "neutral" {
		return nil
	}
	var found *unit
	for u := range cm.state.playerUnits() {
		gap, radius := distance(m.char.At, u.char.At), m.aggroRadius(u)
		if u.char.Continent != m.char.Continent || gap > radius || u.Health <= 0 || cm.untargetable(u, cm.now()) {
			continue
		}
		if (found == nil || gap < distance(m.char.At, found.char.At)) && cm.sees(m.char.Continent, eyes(m.char.At), eyes(u.char.At)) {
			found = u
		}
	}
	return found
}

// watched says whether a player is near enough a mob to see it.
func (cm *Combat) watched(m *mob) bool {
	for u := range cm.state.playerUnits() {
		if u.char.Continent == m.char.Continent && nearby(u.char.At, m.char.At) {
			return true
		}
	}
	return false
}

// aggroRadius is how near a hostile mob notices a player: its creature's radius, a tenth longer
// for each level it has over the player and a tenth shorter for each the player has over it, from
// a quarter of it to twice it.
func (m *mob) aggroRadius(u *unit) float64 {
	radius := m.creature.AggroRadius
	if radius <= 0 {
		radius = aggroFt
	}
	level := 1
	if u.fight != nil {
		level = u.fight.level
	}
	return radius * min(max(1+0.1*float64(m.base.Level-level), 0.25), 2)
}

// wander has a mob at peace stroll somewhere near home now and then.
func (cm *Combat) wander(m *mob, dt float64, now time.Time) {
	if m.mind.goal != nil {
		if cm.walk(m, *m.mind.goal, walkFt, 0, "walk", dt, now) {
			m.mind.goal = nil
			m.mind.wanderAt = now.Add(seconds(wanderEvery * (1 + cm.roll())))
		}
		return
	}
	cm.say(m, m.char.At, m.char.Yaw, Move{Gait: "run"}, now)
	far := wanderFt
	if m.placing.Wander != nil {
		far = *m.placing.Wander
	}
	if far <= 0 || now.Before(m.mind.wanderAt) {
		return
	}
	angle, gap := 2*math.Pi*cm.roll(), far*math.Sqrt(cm.roll())
	goal := [3]float64{m.home[0] + math.Sin(angle)*gap, m.home[1], m.home[2] + math.Cos(angle)*gap}
	m.mind.goal = &goal
}

// walk takes a mob toward a place at a speed, stopping `short` of it, and says whether it's there.
// Something it can't climb stops it, and one stopped on its way home is put there.
func (cm *Combat) walk(m *mob, to [3]float64, speed, short float64, gait string, dt float64, now time.Time) bool {
	from := m.char.At
	gap := horizontal(from, to)
	if gap <= short+0.01 {
		cm.say(m, from, m.char.Yaw, Move{Gait: "run"}, now)
		return true
	}
	share := min(speed*dt, gap-short) / gap
	next := [3]float64{from[0] + (to[0]-from[0])*share, from[1], from[2] + (to[2]-from[2])*share}
	end := stoppingAt(cm.state.ground(m.char.Continent), from, next, false)
	yaw := math.Atan2(to[0]-from[0], to[2]-from[2])
	if horizontal(from, end) < 1e-6 && speed*dt > 0 {
		if m.mind.mode == "home" {
			cm.say(m, m.home, yaw, Move{Gait: "run"}, now)
			return true
		}
		if m.mind.mode == "fight" {
			cm.giveUp(m, now) // it can't get there
		} else {
			m.mind.goal = nil
		}
		return false
	}
	cm.say(m, end, yaw, Move{Forward: 1, Gait: gait}, now)
	return false
}

// say puts a mob somewhere, and tells those near when how it's moving changes, or now and then.
func (cm *Combat) say(m *mob, at [3]float64, yaw float64, move Move, now time.Time) {
	changed := move != m.char.Move || (move.Forward == 0 && math.Abs(yaw-m.char.Yaw) > 0.05)
	tell := changed || (move.Forward != 0 && now.Sub(m.mind.saidAt) >= sayMovesEvery)
	if at == m.char.At && yaw == m.char.Yaw && !tell {
		return
	}
	cm.state.placeMob(m, at, yaw, move, tell)
	if tell {
		m.mind.saidAt = now
	}
}

// mobSwing is a mob's swing at a unit, for `base` damage before what the target's stats make of it.
// A training dummy's sparring swing is one too, and never takes the last of your health.
func (cm *Combat) mobSwing(m *mob, on *unit, base float64, now time.Time) {
	cm.state.tellOf(on.ID, encode(swung{"swung", m.ID, on.ID}))
	ctx := combat.HitContext{Schools: []string{"physical"}, Kinds: []string{"auto", "melee", "direct", "main", "single"}, Other: m.ID}
	h := hit{Type: "hit", From: m.ID, On: on.ID, Effect: "damage"}
	theirs := cm.statsOf(on, &ctx, now)
	front := facing(on.char.At, on.char.Yaw, m.char.At)
	level := 1
	if on.fight != nil {
		level = on.fight.level
	}
	if !cm.avoided(on, m.ID, theirs, true, front, &ctx, &h, now) {
		n := theirs.Taken(base, ctx, level)
		blocked := combat.Blocks(theirs, true, front, cm.roll)
		if blocked {
			n *= 1 - combat.BlockShare
			h.Blocked = true
		}
		n = cm.soak(on, n, ctx.Schools, &h, now)
		if m.training {
			n = min(n, on.Health-1)
		}
		cm.harm(&m.unit, on, max(n, 0), &h, now)
		if blocked {
			cm.fire(event{on: "block", who: on, other: m.ID, ctx: &ctx, amount: n}, now)
		}
		cm.fire(event{on: "takeDamage", who: on, other: m.ID, ctx: &ctx, amount: n}, now)
	}
	cm.state.showHit(on.ID, on, h)
}

// speed is how fast a mob runs, against a player.
func (m *mob) speed() float64 {
	if m.creature.Speed > 0 {
		return m.creature.Speed
	}
	return 1
}

// reach is how near a mob has to be to swing.
func (m *mob) reach() float64 {
	if r := m.creature.Attack.Range; !r.Melee && r.Feet > 0 {
		return r.Feet
	}
	return combat.MeleeFt
}

// swingDamage is what a mob's swing does before the target's stats.
func (m *mob) swingDamage() float64 {
	share := m.creature.Damage
	if share <= 0 {
		share = 1
	}
	return (4 + 2*float64(m.base.Level)) * share
}

// eyes is where someone at `at` looks from.
func eyes(at [3]float64) [3]float64 { return [3]float64{at[0], at[1] + 5, at[2]} }
