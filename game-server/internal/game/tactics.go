package game

import (
	"math"
	"time"
)

// Tactics: how a fighting mob picks which of its abilities to use, by its creature's `tactics`.
//   - random (the default): any it can use now.
//   - priority: the first in its list it can use now.
//   - rotation: the next in its list, in turn, waiting for that one to be ready.
// It chases and swings while none is. Its onDeath ability is only for dying: it uses that as it
// dies, from where it fell, with no cost or cast time.

// useAbility has a fighting mob use an ability on its target now, as its tactics pick, and says
// whether it did.
func (cm *Combat) useAbility(m *mob, t *unit, now time.Time) bool {
	tactics := m.creature.Tactics
	switch tactics.Type {
	case "priority":
		for _, id := range tactics.Abilities {
			if cm.tryAbility(m, t, id, now) {
				return true
			}
		}
		return false
	case "rotation":
		if len(tactics.Abilities) == 0 {
			return false
		}
		id := tactics.Abilities[m.mind.turn%len(tactics.Abilities)]
		if !cm.tryAbility(m, t, id, now) {
			return false
		}
		m.mind.turn++
		return true
	}
	var ready []string
	for _, a := range m.fight.class.Abilities {
		if a.ID != m.creature.OnDeath && cm.canUse(m, t, a.ID, now) {
			ready = append(ready, a.ID)
		}
	}
	if len(ready) == 0 {
		return false
	}
	return cm.tryAbility(m, t, ready[min(int(cm.roll()*float64(len(ready))), len(ready)-1)], now)
}

// canUse says whether a mob could use an ability on its target now, standing and facing it, as it
// would to cast.
func (cm *Combat) canUse(m *mob, t *unit, id string, now time.Time) bool {
	if id == m.creature.OnDeath || m.fight.class.Ability(id) == nil {
		return false
	}
	face := math.Atan2(t.char.At[0]-m.char.At[0], t.char.At[2]-m.char.At[2])
	moving, yaw := m.char.Move, m.char.Yaw
	m.char.Move, m.char.Yaw = Move{Gait: moving.Gait}, face
	_, _, why := cm.check(&m.unit, incoming{Type: "use", Ability: id, Target: t.ID}, now)
	m.char.Move, m.char.Yaw = moving, yaw
	return why == ""
}

// tryAbility has a mob stop, turn to its target and use an ability if it can, and says whether it
// did.
func (cm *Combat) tryAbility(m *mob, t *unit, id string, now time.Time) bool {
	if !cm.canUse(m, t, id, now) {
		return false
	}
	cm.say(m, m.char.At, math.Atan2(t.char.At[0]-m.char.At[0], t.char.At[2]-m.char.At[2]), Move{Gait: "run"}, now)
	cm.use(&m.unit, incoming{Type: "use", Ability: id, Target: t.ID})
	return true
}

// lastAct has a dying mob use its onDeath ability, from where it fell, at whoever it was fighting,
// with no cost or cast time. A channel lands once, as if it were instant, since its caster's gone.
func (cm *Combat) lastAct(m *mob, now time.Time) {
	if m.fight == nil || m.creature.OnDeath == "" {
		return
	}
	found := m.fight.class.Ability(m.creature.OnDeath)
	if found == nil {
		return
	}
	a := *found
	a.Cost, a.CastTime, a.Channel = nil, 0, nil
	target := int64(0)
	if a.Target == "enemy" || a.Target == "ally" || a.Target == "any" {
		target = m.mind.target
		if t := cm.state.unit(target, m.char.Continent); t == nil {
			return // it needs someone to aim at
		}
	}
	cm.state.tellOf(m.ID, encode(used{Type: "used", ID: m.ID, Class: m.fight.class.ID, Ability: a.ID, Target: target, School: a.School, Schools: a.Schools, Animation: a.Animation}))
	c := &casting{ability: &a, target: target, release: now, ends: now, last: true}
	cm.release(&m.unit, c, now)
}
