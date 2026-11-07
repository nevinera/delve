package game

import "time"

// Threat: each placed mob in a fight keeps how much each unit fighting it has made it want to hit
// that one, and fights whoever has the most. Damage done to a mob makes that much threat on it.
// Healing makes threat on every mob fighting the one healed, half the healing that lands. A mob
// changes target only when someone passes its target's threat by a tenth, from within its melee
// reach, or by three tenths from further off. Going home or dying clears it.

const (
	healThreat  = 0.5 // threat for each point of healing that lands
	meleeSwitch = 1.1 // how far past the target's threat, from within melee reach, to pull a mob
	rangeSwitch = 1.3 // and from further off
)

// addThreat has a unit make threat on a placed mob, which fights it if it was at peace.
func (cm *Combat) addThreat(m *mob, from *unit, n float64, now time.Time) {
	if from == nil || from.mob != nil || m.training || m.creature == nil || m.char.Dead || m.mind.mode == "home" {
		return
	}
	cm.engage(m, from, now)
	if m.mind.mode != "fight" {
		return
	}
	if m.mind.threat == nil {
		m.mind.threat = map[int64]float64{}
	}
	m.mind.threat[from.ID] += max(n, 0)
}

// healThreatOf has a heal that landed on a unit make threat on the mobs fighting it.
func (cm *Combat) healThreatOf(healer, on *unit, n float64, now time.Time) {
	if healer == nil || healer.mob != nil || on.mob != nil || n <= 0 {
		return
	}
	for _, m := range cm.state.mobList() {
		if _, fighting := m.mind.threat[on.ID]; fighting && m.mind.mode == "fight" {
			cm.addThreat(m, healer, n*healThreat, now)
		}
	}
}

// dropThreat takes a unit off every mob's threat, as it dies or leaves. A mob with no one left to
// fight goes home.
func (cm *Combat) dropThreat(u *unit, now time.Time) {
	for _, m := range cm.state.mobList() {
		if _, ok := m.mind.threat[u.ID]; !ok {
			continue
		}
		delete(m.mind.threat, u.ID)
		if m.mind.target == u.ID {
			m.mind.target = 0
			if t := cm.mostThreat(m); t != nil {
				m.mind.target = t.ID
			} else {
				cm.giveUp(m, now)
			}
		}
	}
}

// mostThreat is the unit fighting a mob with the most threat on it that's still there to fight,
// leaving those that aren't off its table, or nil.
func (cm *Combat) mostThreat(m *mob) *unit {
	var best *unit
	bestThreat := -1.0
	for id, n := range m.mind.threat {
		u := cm.state.unit(id, m.char.Continent)
		if u == nil || !cm.state.present(u) || u.Health <= 0 {
			delete(m.mind.threat, id)
			continue
		}
		if n > bestThreat || (n == bestThreat && id < best.ID) {
			best, bestThreat = u, n
		}
	}
	return best
}

// target is who a fighting mob fights now: its target, unless someone's passed it by enough, or
// whoever has the most threat if its target's gone. Nil if no one's left.
func (cm *Combat) target(m *mob) *unit {
	best := cm.mostThreat(m)
	if best == nil {
		return nil
	}
	current := cm.state.unit(m.mind.target, m.char.Continent)
	if _, still := m.mind.threat[m.mind.target]; !still || current == nil {
		m.mind.target = best.ID
		return best
	}
	if best != current {
		need := rangeSwitch
		if distance(best.char.At, m.char.At) <= m.reach() {
			need = meleeSwitch
		}
		if m.mind.threat[best.ID] > m.mind.threat[current.ID]*need {
			m.mind.target = best.ID
			return best
		}
	}
	return current
}
