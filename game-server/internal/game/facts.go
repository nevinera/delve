package game

import (
	"encoding/json"
	"slices"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// The facts conditions are judged on: units, their statuses and the fighter's state.

// statusNames gives a status's name by id, for what a player reads.
func statusNames(u *unit) func(string) string {
	return func(id string) string {
		if s := u.fight.class.Status(id); s != nil {
			return s.Name
		}
		return id
	}
}

// factsInUse is what an ability's effects are read against, with how the use is going.
func (cm *Combat) factsInUse(u *unit, c *casting, target int64, hits int, now time.Time) *combat.Facts {
	out := cm.facts(u, target, now)
	out.Used = &combat.UseSoFar{Spent: c.spent, Hits: hits, Crit: c.crit, Survived: c.survived, Landed: c.landed}
	return out
}

// facts is what conditions are read against, for a player and its target.
func (cm *Combat) facts(u *unit, target int64, now time.Time) *combat.Facts {
	f := u.fight
	out := &combat.Facts{
		Self:      unitOf(f.self, u.ID, cm.fighterState(u, now)),
		Since:     map[string]float64{},
		Resources: map[string]combat.ResourceAmount{},
	}
	for what, at := range f.since {
		out.Since[what] = now.Sub(at).Seconds()
	}
	out.Holders, out.InEffectAreas = map[string]int{}, map[string]bool{}
	out.Groups = groupsOn(f.self)
	for v := range cm.state.units() {
		for key := range v.Statuses {
			if key.from == u.ID {
				out.Holders[key.id]++
			}
		}
	}
	for _, z := range cm.effectAreas {
		if z.from == u && z.inside[target] != nil {
			out.InEffectAreas[z.kind] = true
		}
	}
	if t := cm.state.unit(target, u.char.Continent); t != nil {
		out.TargetGroups = groupsOn(t)
	}
	if f.class != nil {
		for _, r := range f.class.Resources {
			out.Resources[r.Key] = combat.ResourceAmount{Have: f.resources[r.Key], Max: f.pool(r).Max}
		}
	}
	if d := cm.state.mob(target, u.char.Continent); d != nil {
		state := []string{}
		if !d.lastHit.IsZero() && now.Sub(d.lastHit) < combatLasts {
			state = append(state, "inCombat")
		}
		unit := unitOf(&d.unit, u.ID, state)
		out.Target, out.TargetIs = &unit, []string{"enemy", "other", "nonPlayer"}
		out.Position = positionOf(u.char.At, d.state.At, d.state.Yaw)
	} else if o := cm.state.caster(target); o != nil && target != 0 {
		unit := unitOf(o, u.ID, cm.fighterState(o, now))
		out.Target, out.TargetIs = &unit, []string{"ally", "player"}
		if o == u {
			out.TargetIs = append(out.TargetIs, "self")
		} else {
			out.TargetIs = append(out.TargetIs, "other")
		}
		out.Position = positionOf(u.char.At, o.char.At, o.char.Yaw)
	}
	if u.mob != nil { // to a mob, players are enemies and mobs allies
		for i, is := range out.TargetIs {
			switch is {
			case "enemy":
				out.TargetIs[i] = "ally"
			case "ally":
				out.TargetIs[i] = "enemy"
			}
		}
	}
	return out
}

// unitOf is a unit as one reader's conditions see it: its statuses are the ones that reader put on.
func unitOf(v *unit, reader int64, state []string) combat.Unit {
	stacks := map[string]int{}
	for key, s := range v.Statuses {
		if key.from == reader {
			stacks[key.id] = s.stacks
		}
	}
	return combat.Unit{Health: v.Health, MaxHealth: v.MaxHealth, Statuses: stacks, State: state}
}

// lookOn is the look a unit's holding a `transform` gives it, the latest put on, or nil for its own.
func lookOn(v *unit) json.RawMessage {
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
func groupsOn(v *unit) map[string]bool {
	out := map[string]bool{}
	for _, held := range v.Statuses {
		if held.def.Group != "" {
			out[held.def.Group] = true
		}
	}
	return out
}

// fighterState is which of a `state` condition's words are true of a player, or a mob that casts. Everywhere counts as
// outdoors.
func (cm *Combat) fighterState(u *unit, now time.Time) []string {
	state := []string{"outdoors"}
	controls := cm.controlsOn(u)
	if combat.Helpless(controls) {
		state = append(state, "controlled")
	}
	if slices.Contains(controls, "stun") {
		state = append(state, "stunned")
	}
	motion := cm.state.motionOf(u) // nil for a mob
	if motion != nil && motion.slowed < 0 {
		state = append(state, "slowed")
	}
	if u.fight.cast != nil {
		state = append(state, "casting")
	}
	if motion != nil && motion.aloft {
		state = append(state, "airborne", "falling")
	}
	if u.fight.inCombat(now) {
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
