package game

import (
	"context"
	"log"
	"math"
	"slices"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// A player's side of combat: its class, level, build, bars and resources.

// classWithID is the class with that id, or nil.
func classWithID(classes []*combat.Class, id string) *combat.Class {
	for _, class := range classes {
		if class.ID == id {
			return class
		}
	}
	return nil
}

// enterFight gives a player its class's numbers. With no class, it has plain health and no abilities.
func (p *Player) enterFight(class *combat.Class, level int, build combat.Build) {
	f := &p.fight
	f.unit = unit{ID: p.state.ID, char: &p.state, player: p, fight: f, Statuses: map[statusKey]*activeStatus{}}
	f.self = &f.unit
	f.resources, f.pools, f.cooldowns, f.lockouts, f.since = map[string]float64{}, map[string]combat.Pool{}, map[string][]time.Time{}, map[string]time.Time{}, map[string]time.Time{}
	if class == nil {
		f.unit.base = combat.Plain(100)
		f.unit.MaxHealth, f.unit.Health = 100, 100
		p.state.Health, p.state.MaxHealth = 100, 100
		return
	}
	f.class = class
	f.level = max(level, 1)
	f.stats = combat.StatsFor(f.class, f.level)
	f.unit.base, f.unit.primary = f.stats, f.class.PrimaryStats
	f.unit.MaxHealth, f.unit.Health = f.stats.MaxHealth, f.stats.MaxHealth
	for _, r := range f.class.Resources {
		f.resources[r.Key] = combat.StartResource(r)
	}
	f.resChanged = true // so the first tick tells the player where they stand
	f.build = f.class.Allowed(build, f.level)
	f.ownWeapons = holdsOwnWeapon(p.state.Look)
	p.wearGear()
	p.grantStatuses(time.Time{})
	p.state.Class, p.state.Level, p.state.Health, p.state.MaxHealth = f.class.ID, f.level, f.unit.Health, f.unit.MaxHealth
}

// grantStatuses puts on what a character's class, level and build give it for good, and says
// nothing: the client works these out too (play/build.js).
func (p *Player) grantStatuses(now time.Time) {
	f := &p.fight
	for _, id := range f.class.HeldFrom(f.level, f.build) {
		key := statusKey{id, p.state.ID}
		if f.unit.Statuses[key] != nil {
			continue
		}
		if s := f.class.Status(id); s != nil {
			f.unit.Statuses[key] = &activeStatus{def: s, class: f.class.ID, owner: f.class, since: now, stacks: 1, uses: 1, granted: true}
		} else {
			log.Printf("character %d: class %s holds a status it hasn't got: %s", p.state.ID, f.class.ID, id)
		}
	}
}

// chooseBuild changes a character's specialization and talents, out of combat, and keeps them.
func (l *Layer) chooseBuild(p *Player, b combat.Build) {
	l.mu.Lock()
	defer l.mu.Unlock()
	f := &p.fight
	if l.players[p.ID()] != p || f.class == nil {
		return
	}
	now := l.hub.now()
	if f.inCombat(now) {
		p.send(encode(refused{"refused", "", "you can't change that in combat"}))
		return
	}
	l.applyBuild(p, b, now)
	world, id, spec, talents := l.worldID, p.ID(), f.build.Specialization, f.build.Talents
	go func() {
		if err := l.hub.characters.SaveBuild(context.Background(), world, id, spec, talents); err != nil {
			log.Printf("character %d: couldn't keep its build: %v", id, err)
		}
	}()
}

// applyBuild gives a character as much of a build as its level allows, and the statuses that
// come with it, and tells it.
func (l *Layer) applyBuild(p *Player, b combat.Build, now time.Time) {
	f := &p.fight
	f.build = f.class.Allowed(b, f.level)
	keep := f.class.HeldFrom(f.level, f.build)
	for key, held := range f.unit.Statuses {
		if held.granted && !slices.Contains(keep, key.id) {
			l.removeStatus(&f.unit, key)
		}
	}
	p.grantStatuses(now)
	for key, held := range f.unit.Statuses {
		if held.granted {
			l.tellOf(p.ID(), encode(statusOn{"statusOn", p.ID(), shownOf(key, held, now)}))
		}
	}
	p.send(encode(buildMessage{"build", f.build.Specialization, f.build.Talents}))
	if p.wearGear() {
		l.tellOf(p.ID(), encode(gearMessage{"gear", p.ID(), p.state.Look}))
	}
}

// setLevel moves a character to a level, healed up, and keeps it.
func (l *Layer) setLevel(p *Player, level int) {
	f := &p.fight
	now := l.hub.now()
	wanted := f.build
	f.level = level
	f.stats = combat.StatsFor(f.class, level)
	f.unit.base = f.stats
	p.state.Level = level
	l.tellOf(p.ID(), encode(levelMessage{"level", p.ID(), level}))
	l.applyBuild(p, wanted, now)
	l.combat.refit(&f.unit, now)
	l.resizeHealth(&f.unit, f.unit.MaxHealth, f.unit.MaxHealth)
	world, id := l.worldID, p.ID()
	go func() {
		if err := l.hub.characters.SaveLevel(context.Background(), world, id, level); err != nil {
			log.Printf("character %d: couldn't keep its level: %v", id, err)
		}
	}()
}

// setBars keeps a character's action bars, if they're the right size. They only say where its
// buttons go, so they don't need to be abilities it knows.
func (l *Layer) setBars(p *Player, bars [][]string) {
	if bars == nil || len(bars) > maxBars || slices.ContainsFunc(bars, func(bar []string) bool {
		return len(bar) > maxSlots || slices.ContainsFunc(bar, func(id string) bool { return len(id) > maxSlotLen })
	}) {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.players[p.ID()] != p {
		return
	}
	p.fight.bars = bars
	world, id := l.worldID, p.ID()
	go func() {
		if err := l.hub.characters.SaveBars(context.Background(), world, id, bars); err != nil {
			log.Printf("character %d: couldn't keep its action bars: %v", id, err)
		}
	}()
}

func (f *fighter) inCombat(now time.Time) bool {
	for _, what := range []string{"attack", "damageTaken"} {
		if at, ok := f.since[what]; ok && now.Sub(at) < combatLasts {
			return true
		}
	}
	return false
}

// attacked notes that a player attacked someone, which keeps it in combat.
func (f *fighter) attacked(now time.Time) {
	if !f.inCombat(now) {
		f.since["combatStart"] = now
	}
	f.since["attack"] = now
}

// addResource gives a fighter some of a resource, or takes it with a negative amount. It says
// how much that came to with resourceGain, and whether the fighter has the resource.
func (cm *Combat) addResource(f *fighter, key string, n float64) (float64, bool) {
	for _, r := range f.class.Resources {
		if r.Key == key {
			pool := f.pool(r)
			if n > 0 {
				n *= pool.Gain
			}
			f.resources[key] = max(0, min(pool.Max, f.resources[key]+n))
			f.resChanged = true
			return n, true
		}
	}
	return 0, false
}

// pool is how a resource behaves for a fighter. Until the first tick that's its class's numbers.
func (f *fighter) pool(r combat.Resource) combat.Pool {
	if pool, ok := f.pools[r.Key]; ok {
		return pool
	}
	return combat.PoolOf(r, f.self.base, f.self.primary, nil)
}

// regen brings back resources and tells the player how they stand, every so often.
func (cm *Combat) regen(u *unit, dt float64, now time.Time) {
	f := u.fight
	if f.class == nil {
		return
	}
	mods := cm.modsOf(f.self, nil, now)
	sheet := f.self.base
	if len(mods) > 0 {
		sheet = combat.Sheet(f.self.base, f.self.primary, mods)
	}
	fighting := f.inCombat(now)
	for _, r := range f.class.Resources {
		pool := combat.PoolOf(r, sheet, f.self.primary, mods)
		if old, ok := f.pools[r.Key]; ok && old.Max != pool.Max {
			f.resChanged = true
		}
		f.pools[r.Key] = pool
		was := f.resources[r.Key]
		f.resources[r.Key] = pool.After(was, dt, fighting)
		if f.resources[r.Key] != was {
			f.resChanged = true
		}
	}
	if f.resChanged && now.Sub(f.sentAt) >= resourceEvery {
		out, most := map[string]float64{}, map[string]float64{}
		for _, r := range f.class.Resources {
			out[r.Key], most[r.Key] = shownResource(r, f.resources[r.Key]), math.Round(f.pool(r).Max)
		}
		u.send(encode(resources{"resources", out, most}))
		f.sentAt, f.resChanged = now, false
	}
}

// shownResource is what a player sees of a resource. Points only count once they're whole, so a
// part-earned point doesn't show as one you can spend.
func shownResource(r combat.Resource, have float64) float64 {
	if r.Kind == "points" {
		return math.Floor(have)
	}
	return math.Round(have)
}
