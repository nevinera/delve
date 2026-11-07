package game

import (
	"math"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

// placed is a mob for a creature placed by hand, where it was placed, at a level from its levels.
func (l *Layer) placed(id int64, p worlds.Placed) *mob {
	c := l.world.Creature(p.Creature)
	level := p.Levels[0] + int(l.combat.roll()*float64(p.Levels[1]-p.Levels[0]+1))
	level = min(level, p.Levels[1])
	health := mobHealth(c, level)
	base := combat.Plain(health)
	base.Level = level
	at := l.onGround(p.Continent, p.At[0], p.At[2])
	made := &mob{
		unit:     unit{ID: id, base: base, Health: health, MaxHealth: health, Statuses: map[statusKey]*activeStatus{}},
		creature: c,
		home:     at,
		placing:  p,
		state:    Character{ID: id, Name: c.Name, Look: c.Look, Continent: p.Continent, At: at, Yaw: p.Yaw * math.Pi / 180, Move: Move{Gait: "run"}, Level: level, Health: health, MaxHealth: health},
	}
	made.char, made.mob = &made.state, made
	return made
}

// mobHealth is a creature's health at a level: for now, a player's at that level, times the
// creature's own `health`.
func mobHealth(c *worlds.Creature, level int) float64 {
	share := c.Health
	if share <= 0 {
		share = 1
	}
	return math.Round(10 * (10 + 2*float64(level)) * share)
}

// dead says whether a unit is a mob lying dead.
func (u *unit) dead() bool { return u.mob != nil && u.char.Dead }

// respawnSeconds is how long a placed mob stays dead when its placing doesn't say.
const respawnSeconds = 300

// dies is a mob dying: it lets go of what it holds, those fighting it stop, and it lies where it
// fell until it's due back.
func (cm *Combat) dies(m *mob, now time.Time) {
	m.char.Dead = true
	for key := range m.Statuses {
		cm.state.removeStatus(&m.unit, key)
	}
	for u := range cm.state.playerUnits() {
		if u.fight.attacking == m.ID {
			cm.stopAttacking(u)
		}
	}
	back := m.placing.Respawn
	if back <= 0 {
		back = respawnSeconds
	}
	m.backAt = now.Add(seconds(back))
	m.mind = mind{}
	cm.state.tellOf(m.ID, encode(died{"died", m.ID}))
}

// comeBack puts a dead mob back where it was placed, at full health, at a new level from its
// levels, and shows it to those near. Those near only where it fell see the body go.
func (l *Layer) comeBack(m *mob) {
	gone := map[*Player]bool{}
	for _, o := range l.playersNear(m.state.Continent, m.state.At) {
		gone[o] = true
	}
	*m = *l.placed(m.ID, m.placing)
	m.char, m.mob = &m.state, m
	back := encode(appear{"appear", l.seen(m.state)})
	for _, o := range l.playersNear(m.state.Continent, m.state.At) {
		o.send(back)
		delete(gone, o)
	}
	for o := range gone {
		o.send(encode(vanish{"vanish", m.ID})) // the body's gone from where it fell
	}
}

// placeMob moves a mob, and shows it to those it's come near, and takes it away from those it's
// left. With `say`, those who still see it hear how it's moving.
func (l *Layer) placeMob(m *mob, at [3]float64, yaw float64, move Move, say bool) {
	before := map[*Player]bool{}
	for _, o := range l.playersNear(m.state.Continent, m.state.At) {
		before[o] = true
	}
	m.state.At, m.state.Yaw, m.state.Move = at, yaw, move
	update := encode(moved{"moved", m.ID, at, yaw, move})
	for _, o := range l.playersNear(m.state.Continent, at) {
		switch {
		case !before[o]:
			o.send(encode(appear{"appear", l.seen(m.state)}))
		case say:
			o.send(update)
		}
		delete(before, o)
	}
	for o := range before {
		o.send(encode(vanish{"vanish", m.ID}))
	}
}

// playerDies is a player's health running out: the mobs fighting it go home, what mobs put on it
// comes off, and it wakes at home.
func (cm *Combat) playerDies(u *unit, now time.Time) {
	for _, m := range cm.state.mobList() {
		if m.mind.mode == "fight" && m.mind.target == u.ID {
			cm.giveUp(m, now)
		}
	}
	for key := range u.Statuses {
		if key.from < 0 {
			cm.takeOff(u, key)
		}
	}
	cm.state.wakeHome(u)
}
