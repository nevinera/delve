package game

import (
	"encoding/json"
	"slices"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// The facts conditions are judged on: units, their statuses and the fighter's state.

// statusNames gives a status's name by id, for what a player reads.
func statusNames(p *Player) func(string) string {
	return func(id string) string {
		if s := p.fight.class.Status(id); s != nil {
			return s.Name
		}
		return id
	}
}

// factsInUse is what an ability's effects are read against, with how the use is going.
func (l *Layer) factsInUse(p *Player, c *casting, target int64, hits int, now time.Time) *combat.Facts {
	out := l.facts(p, target, now)
	out.Used = &combat.UseSoFar{Spent: c.spent, Hits: hits, Crit: c.crit, Survived: c.survived, Landed: c.landed}
	return out
}

// facts is what conditions are read against, for a player and its target.
func (l *Layer) facts(p *Player, target int64, now time.Time) *combat.Facts {
	f := &p.fight
	out := &combat.Facts{
		Self:      unitOf(&f.vitals, p.ID(), l.fighterState(p, now)),
		Since:     map[string]float64{},
		Resources: map[string]combat.ResourceAmount{},
	}
	for what, at := range f.since {
		out.Since[what] = now.Sub(at).Seconds()
	}
	out.Holders, out.InAreas = map[string]int{}, map[string]bool{}
	out.Groups = groupsOn(&f.vitals)
	l.eachUnit(func(v *vitals, _ [3]float64, _ string) {
		for key := range v.Statuses {
			if key.from == p.ID() {
				out.Holders[key.id]++
			}
		}
	})
	for _, z := range l.zones {
		if z.from == p && z.inside[target] != nil {
			out.InAreas[z.kind] = true
		}
	}
	if t := l.unitWithID(target, p.state.Continent); t != nil {
		out.TargetGroups = groupsOn(t)
	}
	if f.class != nil {
		for _, r := range f.class.Resources {
			out.Resources[r.Key] = combat.ResourceAmount{Have: f.resources[r.Key], Max: f.pool(r).Max}
		}
	}
	if d := l.dummy(target, p.state.Continent); d != nil {
		state := []string{}
		if !d.lastHit.IsZero() && now.Sub(d.lastHit) < combatLasts {
			state = append(state, "inCombat")
		}
		unit := unitOf(&d.vitals, p.ID(), state)
		out.Target, out.TargetIs = &unit, []string{"enemy", "other", "nonPlayer"}
		out.Position = positionOf(p.state.At, d.state.At, d.state.Yaw)
	} else if o := l.players[target]; o != nil && target != 0 {
		unit := unitOf(&o.fight.vitals, p.ID(), l.fighterState(o, now))
		out.Target, out.TargetIs = &unit, []string{"ally", "player"}
		if o == p {
			out.TargetIs = append(out.TargetIs, "self")
		} else {
			out.TargetIs = append(out.TargetIs, "other")
		}
		out.Position = positionOf(p.state.At, o.state.At, o.state.Yaw)
	}
	return out
}

// unitOf is a unit as one reader's conditions see it: its statuses are the ones that reader put on.
func unitOf(v *vitals, reader int64, state []string) combat.Unit {
	stacks := map[string]int{}
	for key, s := range v.Statuses {
		if key.from == reader {
			stacks[key.id] = s.stacks
		}
	}
	return combat.Unit{Health: v.Health, MaxHealth: v.MaxHealth, Statuses: stacks, State: state}
}

// lookOn is the look a unit's holding a `transform` gives it, the latest put on, or nil for its own.
func lookOn(v *vitals) json.RawMessage {
	var look json.RawMessage
	var since time.Time
	for _, held := range v.Statuses {
		for i := range held.def.Effects {
			if e := &held.def.Effects[i]; e.Type == "transform" && !held.since.Before(since) {
				if unit := held.unit(e.Into); unit != nil {
					look, since = unit.Look, held.since
				}
			}
		}
	}
	return look
}

// unit is a unit of the class this status came from.
func (a *activeStatus) unit(id string) *combat.ClassUnit {
	if a.owner == nil {
		return nil
	}
	for i := range a.owner.Units {
		if a.owner.Units[i].ID == id {
			return &a.owner.Units[i]
		}
	}
	return nil
}

// groupsOn is the status groups a unit holds something of.
func groupsOn(v *vitals) map[string]bool {
	out := map[string]bool{}
	for _, held := range v.Statuses {
		if held.def.Group != "" {
			out[held.def.Group] = true
		}
	}
	return out
}

// fighterState is which of a `state` condition's words are true of a player. Everywhere counts as
// outdoors.
func (l *Layer) fighterState(p *Player, now time.Time) []string {
	state := []string{"outdoors"}
	controls := l.controlsOn(&p.fight.vitals)
	if combat.Helpless(controls) {
		state = append(state, "controlled")
	}
	if slices.Contains(controls, "stun") {
		state = append(state, "stunned")
	}
	if p.motion.slowed < 0 {
		state = append(state, "slowed")
	}
	if p.fight.cast != nil {
		state = append(state, "casting")
	}
	if p.motion.aloft {
		state = append(state, "airborne", "falling")
	}
	if p.fight.inCombat(now) {
		state = append(state, "inCombat")
	}
	return state
}

// positionOf says whether someone at `from` is behind or in front of a unit at `at` facing `yaw`.
func positionOf(from, at [3]float64, yaw float64) string {
	if facing(at, yaw, from) {
		return "inFront"
	}
	return "behind"
}
