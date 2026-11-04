package game

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"slices"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// Combat on a layer: using abilities, casts and channels, what lands and when. Clients say what
// they want to use; everything else is worked out here, against where the server has everyone.

const (
	CombatTick     = 50 * time.Millisecond
	strikeDelay    = 300 * time.Millisecond // how far into its attack clip a melee hit lands
	dummyHealth    = 100000.0
	dummyResetIdle = 5 * time.Second // a dummy heals up and its tally starts over after this long unhit
	combatLasts    = 5 * time.Second // you're in combat until this long after you last attacked or were hit
	resourceEvery  = 500 * time.Millisecond
)

// vitals are what can be hurt and healed: a player's, or a dummy's.
type vitals struct {
	ID        int64
	Health    float64
	MaxHealth float64
	Statuses  map[string]*activeStatus
}

// activeStatus is a status on a unit, until it runs out. With no `until`, it stays until removed.
type activeStatus struct {
	class  string
	until  time.Time
	stacks int
}

// dummy is a training dummy: it takes damage, never dies or fights back, and tallies who's hit it.
type dummy struct {
	vitals
	state    Character
	firstHit time.Time
	lastHit  time.Time
	damage   float64
}

// fighter is a player's part in combat.
type fighter struct {
	class      *combat.Class
	level      int
	stats      combat.Stats
	vitals     vitals
	resources  map[string]float64
	sentAt     time.Time
	resChanged bool
	gcdUntil   time.Time
	cooldowns  map[string][]time.Time // when each spent charge of an ability comes back
	cast       *casting
	attacking  int64                // who it's auto-attacking, or 0
	swingAt    time.Time            // when its next swing can start
	swingWhy   string               // why it last couldn't swing, so it says so once
	since      map[string]time.Time // when each thing a `since` condition asks about last happened
}

// casting is a cast or channel under way.
type casting struct {
	ability  *combat.Ability
	target   int64
	spot     *[3]float64
	release  time.Time // when a cast lets go
	ends     time.Time // when it stops: the release, or the channel's end
	channel  bool
	released bool
	stopped  bool
	spent    float64 // what its costs came to
}

// landing is something that happens at a time: a hit arriving, a channel's tick.
type landing struct {
	at   time.Time
	cast *casting // when it stops with a channel
	run  func(now time.Time)
}

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
func (p *Player) enterFight(class *combat.Class, level int) {
	f := &p.fight
	f.vitals = vitals{ID: p.state.ID, Statuses: map[string]*activeStatus{}}
	f.resources, f.cooldowns, f.since = map[string]float64{}, map[string][]time.Time{}, map[string]time.Time{}
	if class == nil {
		f.vitals.MaxHealth, f.vitals.Health = 100, 100
		p.state.Health, p.state.MaxHealth = 100, 100
		return
	}
	f.class = class
	f.level = max(level, 1)
	f.stats = combat.StatsFor(f.class, f.level)
	f.vitals.MaxHealth, f.vitals.Health = f.stats.MaxHealth, f.stats.MaxHealth
	for _, r := range f.class.Resources {
		f.resources[r.Key] = combat.StartResource(r)
	}
	p.state.Class, p.state.Level, p.state.Health, p.state.MaxHealth = f.class.ID, f.level, f.vitals.Health, f.vitals.MaxHealth
}

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
		l.dummies = append(l.dummies, &dummy{
			vitals: vitals{ID: id, Health: dummyHealth, MaxHealth: dummyHealth, Statuses: map[string]*activeStatus{}},
			state:  Character{ID: id, Name: "Training Dummy", Look: json.RawMessage(`{"body":"goblin"}`), Continent: d.Continent, At: at, Move: Move{Gait: "run"}, Dummy: true, Health: dummyHealth, MaxHealth: dummyHealth},
		})
	}
}

func (l *Layer) dummiesOn(continent string) []Character {
	out := []Character{}
	for _, d := range l.dummies {
		if d.state.Continent == continent {
			out = append(out, d.state)
		}
	}
	return out
}

// use starts the ability a player asks for, or says why it can't.
func (l *Layer) use(p *Player, m incoming) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.players[p.ID()] != p {
		return
	}
	now := l.hub.now()
	ability, target, why := l.check(p, m, now)
	if why != "" {
		p.debugLine("%s: refused: %s", m.Ability, why)
		p.send(encode(refused{"refused", m.Ability, why}))
		return
	}
	f := &p.fight
	gcd := combat.GCDSeconds
	if ability.GCD != nil {
		gcd = *ability.GCD
	}
	if gcd > 0 {
		f.gcdUntil = now.Add(seconds(gcd))
	}
	l.tell(p, encode(used{Type: "used", ID: p.ID(), Class: f.class.ID, Ability: ability.ID, Target: target, Spot: m.Spot, GCD: gcd}))
	if ability.Range.Melee && ability.Target == "enemy" {
		l.startAttacking(p, target)
	}
	c := &casting{ability: ability, target: target, spot: m.Spot, release: now.Add(seconds(ability.CastTime)), channel: ability.Channel != nil}
	c.ends = c.release
	if c.channel {
		c.ends = c.release.Add(seconds(ability.Channel.Duration))
	}
	if ability.CastTime > 0 {
		f.cast = c
		return
	}
	l.release(p, c, now)
}

// check says whether a player can use an ability now: the ability and its target, or why not.
func (l *Layer) check(p *Player, m incoming, now time.Time) (*combat.Ability, int64, string) {
	f := &p.fight
	if f.class == nil {
		return nil, 0, "you have no class"
	}
	ability := f.class.Ability(m.Ability)
	if ability == nil || !f.class.Knows(ability, f.level) {
		return nil, 0, "you don't know that"
	}
	if f.cast != nil {
		return nil, 0, "you're busy"
	}
	gcd := combat.GCDSeconds
	if ability.GCD != nil {
		gcd = *ability.GCD
	}
	if gcd > 0 && now.Before(f.gcdUntil) {
		return nil, 0, "not ready yet"
	}
	if len(live(f.cooldowns[ability.ID], now)) >= max(ability.Charges, 1) {
		return nil, 0, "not ready yet"
	}
	if why := l.affordable(f, ability); why != "" {
		return nil, 0, why
	}
	waits := ability.CastTime > 0 || ability.Channel != nil
	if waits && !ability.CastWhileMoving && movingNow(p.state.Move) {
		return nil, 0, "you can't do that while moving"
	}
	var target int64
	var at [3]float64
	switch ability.Target {
	case "enemy":
		d := l.dummy(m.Target, p.state.Continent)
		if d == nil {
			return nil, 0, "you need an enemy targeted"
		}
		target, at = d.ID, d.state.At
	case "ally":
		o := l.players[m.Target]
		if o == nil || o.state.Continent != p.state.Continent {
			o = p // with no ally targeted, it goes on you
		}
		target, at = o.ID(), o.state.At
	case "ground":
		if m.Spot == nil || !finite(*m.Spot, 0, 0) {
			return nil, 0, "you need to pick a spot"
		}
		at = *m.Spot
	default:
		if why := l.unmet(p, ability, 0, now); why != "" {
			return nil, 0, why
		}
		return ability, 0, ""
	}
	gap := distance(p.state.At, at)
	reach := ability.Range.Feet
	if ability.Range.Melee {
		reach = combat.MeleeFt
	}
	if (reach > 0 && gap > reach) || gap < ability.MinRange {
		return nil, 0, "out of range"
	}
	if needsFacing(ability) && !facing(p.state.At, p.state.Yaw, at) {
		return nil, 0, "you're not facing it"
	}
	if why := l.unmet(p, ability, target, now); why != "" {
		return nil, 0, why
	}
	return ability, target, ""
}

func needsFacing(a *combat.Ability) bool {
	if a.Facing != nil {
		return *a.Facing
	}
	return a.Target == "enemy"
}

// affordable says what the ability needs that the fighter hasn't got.
func (l *Layer) affordable(f *fighter, a *combat.Ability) string {
	for _, cost := range a.Cost {
		if f.resources[cost.Resource] < costOf(f, cost) {
			return "not enough " + cost.Resource
		}
	}
	return ""
}

func costOf(f *fighter, cost combat.Cost) float64 {
	if cost.Percent <= 0 {
		return cost.Amount
	}
	for _, r := range f.class.Resources {
		if r.Key == cost.Resource {
			return combat.MaxResource(r) * cost.Percent / 100
		}
	}
	return 0
}

// release lets go of a cast: it spends what the ability costs, starts its cooldown, and sets off
// what lands.
func (l *Layer) release(p *Player, c *casting, now time.Time) {
	f := &p.fight
	a := c.ability
	c.released = true
	if why := l.affordable(f, a); why != "" {
		f.cast = nil
		p.send(encode(refused{"refused", a.ID, why}))
		l.tell(p, encode(stopped{"stopped", p.ID()}))
		return
	}
	for _, cost := range a.Cost {
		spent := costOf(f, cost)
		f.resources[cost.Resource] -= spent
		f.resChanged = true
		c.spent += spent
		p.debugLine("%s: spent %g %s", a.Name, spent, cost.Resource)
	}
	if a.Cooldown > 0 {
		spent := live(f.cooldowns[a.ID], now)
		from := now
		if len(spent) > 0 {
			from = spent[len(spent)-1]
		}
		f.cooldowns[a.ID] = append(spent, from.Add(seconds(a.Cooldown)))
		p.send(encode(cooldown{"cooldown", a.ID, a.Cooldown}))
	}
	if c.channel {
		f.cast = c
		ticks := max(a.Channel.Ticks, 1)
		for n := 1; n <= ticks; n++ {
			at := now.Add(seconds(a.Channel.Duration * float64(n) / float64(ticks)))
			l.after(at, c, func(now time.Time) { l.landAll(p, c, now, false) })
		}
		return
	}
	f.cast = nil
	strike := now
	if a.Range.Melee {
		strike = now.Add(strikeDelay)
	}
	flight := strike
	if a.Speed > 0 {
		if at, ok := l.pointOf(c, p); ok {
			flight = strike.Add(seconds(distance(p.state.At, at) / a.Speed))
		}
	}
	// What flies lands when it arrives; the rest as it's let go.
	l.after(strike, nil, func(now time.Time) { l.landAll(p, c, now, true) })
	if flight != strike {
		l.after(flight, nil, func(now time.Time) { l.landArriving(p, c, now) })
	} else {
		l.after(strike, nil, func(now time.Time) { l.landArriving(p, c, now) })
	}
}

func (l *Layer) after(at time.Time, c *casting, run func(time.Time)) {
	l.landings = append(l.landings, &landing{at: at, cast: c, run: run})
}

// pointOf is where an ability's going: its unit or its spot.
func (l *Layer) pointOf(c *casting, p *Player) ([3]float64, bool) {
	if c.spot != nil {
		return *c.spot, true
	}
	if d := l.dummy(c.target, p.state.Continent); d != nil {
		return d.state.At, true
	}
	if o := l.players[c.target]; o != nil {
		return o.state.At, true
	}
	return [3]float64{}, false
}

// arrives says whether an effect lands when a projectile arrives, as the client's timeline has it.
func arrives(a *combat.Ability, e *combat.Effect) bool {
	return a.Speed > 0 && e.Affects == "target" && (a.Target == "enemy" || a.Target == "ally")
}

// landAll lands an ability's effects, other than those flying if leaveFlying says so.
func (l *Layer) landAll(p *Player, c *casting, now time.Time, leaveFlying bool) {
	l.landWhich(p, c, now, func(e *combat.Effect) bool { return !leaveFlying || !arrives(c.ability, e) })
}

func (l *Layer) landArriving(p *Player, c *casting, now time.Time) {
	l.landWhich(p, c, now, func(e *combat.Effect) bool { return arrives(c.ability, e) })
}

// landWhich lands the effects `which` picks. It reads all their conditions first, so one effect
// can't change whether another lands: one button can start a status or end it.
func (l *Layer) landWhich(p *Player, c *casting, now time.Time, which func(*combat.Effect) bool) {
	if l.players[p.ID()] != p {
		return
	}
	type landingOn struct {
		effect *combat.Effect
		on     *vitals
	}
	var plan []landingOn
	for i := range c.ability.Effects {
		e := &c.ability.Effects[i]
		if !which(e) {
			continue
		}
		reached := l.reached(p, c, e)
		if len(reached) == 0 {
			p.debugLine("%s: %s reached no one", c.ability.Name, e.Type)
		}
		for _, on := range reached {
			target := c.target
			if e.Affects == "enemies" || e.Affects == "allies" {
				target = on.ID // an area's conditions ask about each one it reaches
			}
			if failed, ok := combat.All(e.When, l.facts(p, target, now)); !ok {
				p.debugLine("%s: %s skipped: %s", c.ability.Name, e.Type, failed.Why(statusNames(p)))
				continue
			}
			plan = append(plan, landingOn{e, on})
		}
	}
	for _, each := range plan {
		l.land(p, c, each.effect, each.on, now)
	}
}

// statusNames gives a status's name by id, for what a player reads.
func statusNames(p *Player) func(string) string {
	return func(id string) string {
		if s := p.fight.class.Status(id); s != nil {
			return s.Name
		}
		return id
	}
}

// unmet says why a player can't use an ability on a target, going by its `requires`.
func (l *Layer) unmet(p *Player, a *combat.Ability, target int64, now time.Time) string {
	if failed, ok := combat.All(a.Requires, l.facts(p, target, now)); !ok {
		return failed.Why(statusNames(p))
	}
	return ""
}

// facts is what conditions are read against, for a player and its target.
func (l *Layer) facts(p *Player, target int64, now time.Time) *combat.Facts {
	f := &p.fight
	out := &combat.Facts{
		Self:      unitOf(&f.vitals, fighterState(p, now)),
		Since:     map[string]float64{},
		Resources: map[string]combat.ResourceAmount{},
	}
	for what, at := range f.since {
		out.Since[what] = now.Sub(at).Seconds()
	}
	for _, r := range f.class.Resources {
		out.Resources[r.Key] = combat.ResourceAmount{Have: f.resources[r.Key], Max: combat.MaxResource(r)}
	}
	if d := l.dummy(target, p.state.Continent); d != nil {
		state := []string{}
		if !d.lastHit.IsZero() && now.Sub(d.lastHit) < combatLasts {
			state = append(state, "inCombat")
		}
		unit := unitOf(&d.vitals, state)
		out.Target, out.TargetIs = &unit, []string{"enemy", "other", "nonPlayer"}
		out.Position = positionOf(p.state.At, d.state.At, d.state.Yaw)
	} else if o := l.players[target]; o != nil && target != 0 {
		unit := unitOf(&o.fight.vitals, fighterState(o, now))
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

func unitOf(v *vitals, state []string) combat.Unit {
	stacks := map[string]int{}
	for id, s := range v.Statuses {
		stacks[id] = s.stacks
	}
	return combat.Unit{Health: v.Health, MaxHealth: v.MaxHealth, Statuses: stacks, State: state}
}

// fighterState is which of a `state` condition's words are true of a player. Being slowed,
// controlled or stunned aren't, until statuses can do those, and everywhere counts as outdoors.
func fighterState(p *Player, now time.Time) []string {
	state := []string{"outdoors"}
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

// positionOf says whether someone at `from` is behind or in front of a unit at `at` facing `yaw`.
func positionOf(from, at [3]float64, yaw float64) string {
	if facing(at, yaw, from) {
		return "inFront"
	}
	return "behind"
}

// land does one effect to one unit. Effects that aren't here yet do nothing.
func (l *Layer) land(p *Player, c *casting, e *combat.Effect, on *vitals, now time.Time) {
	f := &p.fight
	h := hit{Type: "hit", From: p.ID(), Ability: c.ability.ID, On: on.ID, Effect: e.Type}
	switch e.Type {
	case "damage":
		l.strike(p, on, e.Amount, &h, now)
	case "consume":
		if e.Affects != "summons" {
			l.consume(p, c, e, on, now)
			return
		}
		p.debugLine("%s: consume of summons does nothing yet", c.ability.Name)
		return
	case "extend":
		l.extend(p, c, e, on, now)
		return
	case "heal":
		n, crit := combat.Roll(e.Amount, f.stats, true, l.hub.roll)
		on.Health = min(on.Health+n, on.MaxHealth)
		h.Amount, h.Crit = math.Round(n), crit
	case "resource":
		n, _ := combat.Roll(e.Amount, f.stats, false, l.hub.roll)
		if l.addResource(f, e.Resource, n) {
			h.Amount, h.Resource = math.Round(n), e.Resource
		}
	case "status":
		if !l.applyStatus(p, c.ability, e.Status, e.Duration, on, &h, now) {
			return
		}
	default:
		p.debugLine("%s: %s does nothing yet", c.ability.Name, e.Type)
		return
	}
	p.debugLine("%s", l.debugHit(p, c.ability.Name, e, on, h))
	h.Health, h.MaxHealth = math.Round(on.Health), on.MaxHealth
	l.sync(on)
	l.tell(p, encode(h))
}

// applyStatus puts a status on a unit and notes it in the hit. It says whether the class has that status.
func (l *Layer) applyStatus(p *Player, a *combat.Ability, id string, duration float64, on *vitals, h *hit, now time.Time) bool {
	f := &p.fight
	s := f.class.Status(id)
	if s == nil {
		log.Printf("character %d: ability %s applies a status its class hasn't got: %s", p.ID(), a.ID, id)
		return false
	}
	lasts := duration
	if lasts == 0 {
		lasts = s.Duration
	}
	held := &activeStatus{class: f.class.ID, stacks: 1}
	if lasts > 0 {
		held.until = now.Add(seconds(lasts))
	}
	on.Statuses[s.ID] = held
	h.Status, h.Lasts, h.Class, h.Stacks = s.ID, lasts, f.class.ID, held.stacks
	return true
}

// consume takes statuses off a unit, or stacks or seconds of them, and does what that's worth.
func (l *Layer) consume(p *Player, c *casting, e *combat.Effect, on *vitals, now time.Time) {
	for _, id := range e.StatusIDs() {
		held := on.Statuses[id]
		if held == nil {
			p.debugLine("%s: %s has no %s to consume", c.ability.Name, l.nameOf(on.ID), id)
			continue
		}
		taken, window := held.stacks, time.Duration(0)
		if e.Stacks > 0 {
			taken = min(e.Stacks, held.stacks)
		}
		if !held.until.IsZero() {
			window = max(held.until.Sub(now), 0)
			if e.Seconds > 0 {
				window = min(window, seconds(e.Seconds))
			}
		}
		if e.DealsLeft > 0 {
			l.dealLeft(p, c, id, e.DealsLeft, taken, window, on, now)
		}
		switch {
		case e.Keeps:
			p.debugLine("%s: %s keeps %s", c.ability.Name, l.nameOf(on.ID), id)
		case e.Stacks > 0 && taken < held.stacks:
			held.stacks -= taken
			l.statusChanged(on.ID, id, held, now)
			p.debugLine("%s: took %d stacks of %s off %s, %d left", c.ability.Name, taken, id, l.nameOf(on.ID), held.stacks)
		case e.Seconds > 0 && !held.until.IsZero() && window < held.until.Sub(now):
			held.until = held.until.Add(-window)
			l.statusChanged(on.ID, id, held, now)
			p.debugLine("%s: took %g s of %s off %s", c.ability.Name, window.Seconds(), id, l.nameOf(on.ID))
		case e.Seconds > 0 && held.until.IsZero():
			p.debugLine("%s: %s has no time to take off %s", c.ability.Name, id, l.nameOf(on.ID))
		default:
			delete(on.Statuses, id)
			l.tellOf(on.ID, encode(statusGone{"statusGone", on.ID, id}))
			p.debugLine("%s: took %s off %s", c.ability.Name, id, l.nameOf(on.ID))
		}
		if e.PerStack != nil {
			for n := 0; n < taken; n++ {
				l.landNested(p, c, e.PerStack, on, now)
			}
		}
	}
}

// landNested lands an effect inside another, on the same unit unless it says who it affects.
func (l *Layer) landNested(p *Player, c *casting, e *combat.Effect, on *vitals, now time.Time) {
	if e.Affects == "" {
		l.land(p, c, e, on, now)
		return
	}
	for _, each := range l.reached(p, c, e) {
		l.land(p, c, e, each, now)
	}
}

// dealLeft does a share of what a status had left to do over a stretch of its time, all at once.
func (l *Layer) dealLeft(p *Player, c *casting, id string, share float64, stacks int, window time.Duration, on *vitals, now time.Time) {
	f := &p.fight
	s := f.class.Status(id)
	if s == nil {
		return
	}
	for _, each := range s.Effects {
		if each.Type != "periodic" || each.Every <= 0 {
			continue
		}
		ticks := int(window.Seconds() / each.Every)
		if ticks == 0 {
			continue
		}
		total, crit := 0.0, false
		for n := 0; n < ticks*stacks; n++ {
			rolled, critical := combat.Roll(each.Amount, f.stats, true, l.hub.roll)
			total += rolled
			crit = crit || critical
		}
		total *= share
		h := hit{Type: "hit", From: p.ID(), Ability: c.ability.ID, On: on.ID, Effect: each.Does, Crit: crit}
		switch each.Does {
		case "damage":
			l.harm(p, on, total, &h, now)
		case "heal":
			on.Health = min(on.Health+total, on.MaxHealth)
			h.Amount = math.Round(total)
		default:
			continue
		}
		p.debugLine("%s: %s had %d ticks left, %g %s", c.ability.Name, id, ticks*stacks, h.Amount, each.Does)
		h.Health, h.MaxHealth = math.Round(on.Health), on.MaxHealth
		l.sync(on)
		l.tellOf(on.ID, encode(h))
	}
}

// extend adds time to statuses on a unit, starts them over, or puts them on if they're missing.
func (l *Layer) extend(p *Player, c *casting, e *combat.Effect, on *vitals, now time.Time) {
	f := &p.fight
	for _, id := range e.StatusIDs() {
		s := f.class.Status(id)
		held := on.Statuses[id]
		if held == nil {
			if !e.Apply {
				p.debugLine("%s: %s has no %s to extend", c.ability.Name, l.nameOf(on.ID), id)
				continue
			}
			h := hit{Type: "hit", From: p.ID(), Ability: c.ability.ID, On: on.ID, Effect: "status"}
			if l.applyStatus(p, c.ability, id, e.Duration, on, &h, now) {
				p.debugLine("%s", l.debugHit(p, c.ability.Name, &combat.Effect{Type: "status"}, on, h))
				h.Health, h.MaxHealth = math.Round(on.Health), on.MaxHealth
				l.tellOf(on.ID, encode(h))
			}
			continue
		}
		if held.until.IsZero() {
			p.debugLine("%s: %s has no end to move", c.ability.Name, id)
			continue
		}
		full := 0.0
		if s != nil {
			full = s.Duration
		}
		if e.Duration > 0 {
			full = e.Duration
		}
		if e.Refresh {
			if full > 0 {
				held.until = now.Add(seconds(full))
			}
		} else {
			until := held.until.Add(seconds(e.Seconds + e.PerSpent*c.spent))
			if e.MaxTotal > 0 {
				until = earlier(until, now.Add(seconds(e.MaxTotal)))
			}
			if e.MaxShare > 0 && full > 0 {
				until = earlier(until, now.Add(seconds(full*e.MaxShare)))
			}
			if until.After(held.until) {
				held.until = until
			}
		}
		l.statusChanged(on.ID, id, held, now)
		p.debugLine("%s: %s on %s now has %g s left", c.ability.Name, id, l.nameOf(on.ID), held.until.Sub(now).Seconds())
	}
}

func earlier(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

// statusChanged tells those near a unit how a status on it stands now.
func (l *Layer) statusChanged(unit int64, id string, held *activeStatus, now time.Time) {
	lasts := 0.0
	if !held.until.IsZero() {
		lasts = held.until.Sub(now).Seconds()
	}
	l.tellOf(unit, encode(statusChanged{"statusChanged", unit, id, held.stacks, lasts}))
}

// tellOf sends a message about a unit to those who can see it.
func (l *Layer) tellOf(unit int64, b []byte) {
	if d := l.dummy(unit, ""); d != nil {
		for _, o := range l.players {
			if o.state.Continent == d.state.Continent {
				o.send(b)
			}
		}
		return
	}
	if o := l.players[unit]; o != nil {
		l.tell(o, b)
	}
}

// debugLine logs a line for a player with combat debug on.
func (p *Player) debugLine(format string, args ...any) {
	if p.combatDebug {
		answer(p, "debug", fmt.Sprintf(format, args...))
	}
}

// debugHit says what an effect came to and how.
func (l *Layer) debugHit(p *Player, ability string, e *combat.Effect, on *vitals, h hit) string {
	line := fmt.Sprintf("%s on %s: %s", ability, l.nameOf(on.ID), e.Type)
	if h.Missed {
		return line + " missed"
	}
	switch e.Type {
	case "damage", "heal", "resource":
		line += fmt.Sprintf(" %g from %s", h.Amount, combat.DescribeAmount(e.Amount, p.fight.stats))
		if e.Type != "resource" {
			line += fmt.Sprintf(", crit %v", h.Crit)
		}
		if e.Resource != "" {
			line += " " + e.Resource
		}
	case "status":
		line += fmt.Sprintf(" %s for %g s", h.Status, h.Lasts)
	}
	return line
}

// nameOf is a unit's name, for the log.
func (l *Layer) nameOf(id int64) string {
	if d := l.dummy(id, ""); d != nil {
		return d.state.Name
	}
	if o := l.players[id]; o != nil {
		return o.state.Name
	}
	return "someone"
}

// strike rolls an attack on an enemy and does what it comes to, noting it in the hit.
func (l *Layer) strike(p *Player, on *vitals, amount combat.Amount, h *hit, now time.Time) {
	if on.ID != p.ID() {
		p.fight.attacked(now)
		if combat.Missed(l.hub.roll) {
			h.Missed = true
			return
		}
	}
	n, crit := combat.Roll(amount, p.fight.stats, true, l.hub.roll)
	h.Crit = crit
	l.harm(p, on, n, h, now)
}

// harm takes health off a unit, noting it in the hit.
func (l *Layer) harm(p *Player, on *vitals, n float64, h *hit, now time.Time) {
	if o := l.players[on.ID]; o != nil {
		o.fight.since["damageTaken"] = now
	}
	on.Health = max(on.Health-n, 0)
	h.Amount = math.Round(n)
	if d := l.dummy(on.ID, p.state.Continent); d != nil {
		d.tally(n, now)
		h.DPS = math.Round(d.dps(now))
		on.Health = max(on.Health, 1) // it never dies
	}
}

// attack starts or stops a player's auto-attack, as it asks.
func (l *Layer) attack(p *Player, m incoming) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.players[p.ID()] != p || p.fight.class == nil {
		return
	}
	if m.Target == 0 {
		l.stopAttacking(p)
		return
	}
	if l.dummy(m.Target, p.state.Continent) == nil {
		p.send(encode(refused{Type: "refused", Why: "you need an enemy targeted"}))
		return
	}
	l.startAttacking(p, m.Target)
}

func (l *Layer) startAttacking(p *Player, target int64) {
	f := &p.fight
	if f.attacking != target {
		f.attacking, f.swingWhy = target, ""
		p.send(encode(attacking{"attacking", target}))
	}
}

func (l *Layer) stopAttacking(p *Player) {
	f := &p.fight
	if f.attacking != 0 {
		f.attacking, f.swingWhy = 0, ""
		p.send(encode(attacking{"attacking", 0}))
	}
}

// swing starts an auto-attack swing if it's time and the target's in reach. A swing waits for a
// cast to end, and for the target to come into reach and in front of you.
func (l *Layer) swing(p *Player, now time.Time) {
	f := &p.fight
	if f.attacking == 0 || f.cast != nil || now.Before(f.swingAt) {
		return
	}
	d := l.dummy(f.attacking, p.state.Continent)
	if d == nil {
		l.stopAttacking(p)
		return
	}
	why := ""
	if distance(p.state.At, d.state.At) > combat.MeleeFt {
		why = "out of range"
	} else if !facing(p.state.At, p.state.Yaw, d.state.At) {
		why = "you're not facing it"
	}
	if why != "" {
		if why != f.swingWhy {
			p.send(encode(refused{Type: "refused", Why: why}))
		}
		f.swingWhy = why
		return
	}
	f.swingWhy = ""
	f.swingAt = now.Add(seconds(combat.SwingSeconds))
	target := d.ID
	l.tell(p, encode(swung{"swung", p.ID(), target}))
	l.after(now.Add(strikeDelay), nil, func(now time.Time) {
		d := l.dummy(target, "")
		if l.players[p.ID()] != p || d == nil {
			return
		}
		h := hit{Type: "hit", From: p.ID(), On: target, Effect: "damage"}
		l.strike(p, &d.vitals, combat.Amount{Weapon: 1}, &h, now)
		h.Health, h.MaxHealth = math.Round(d.Health), d.MaxHealth
		l.sync(&d.vitals)
		l.tell(p, encode(h))
	})
}

func (l *Layer) addResource(f *fighter, key string, n float64) bool {
	for _, r := range f.class.Resources {
		if r.Key == key {
			f.resources[key] = max(0, min(combat.MaxResource(r), f.resources[key]+n))
			f.resChanged = true
			return true
		}
	}
	return false
}

// sync puts what's been done to a unit where those arriving will see it.
func (l *Layer) sync(on *vitals) {
	if on.ID < 0 {
		if d := l.dummy(on.ID, ""); d != nil {
			d.state.Health = on.Health
		}
		return
	}
	if o := l.players[on.ID]; o != nil {
		o.state.Health = on.Health
	}
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

// reached is who an effect lands on.
func (l *Layer) reached(p *Player, c *casting, e *combat.Effect) []*vitals {
	switch e.Affects {
	case "self":
		return []*vitals{&p.fight.vitals}
	case "target":
		if c.ability.Target != "enemy" && c.ability.Target != "ally" {
			return []*vitals{&p.fight.vitals}
		}
		if d := l.dummy(c.target, p.state.Continent); d != nil {
			return []*vitals{&d.vitals}
		}
		if o := l.players[c.target]; o != nil {
			return []*vitals{&o.fight.vitals}
		}
		return nil
	}
	center := p.state.At
	if e.Around == "ground" && c.spot != nil {
		center = *c.spot
	} else if e.Around == "target" {
		if at, ok := l.pointOf(c, p); ok {
			center = at
		}
	}
	type reach struct {
		v   *vitals
		gap float64
	}
	var found []reach
	inside := func(at [3]float64) (float64, bool) {
		gap := distance(center, at)
		if e.Radius > 0 && gap > e.Radius {
			return gap, false
		}
		return gap, e.Cone == 0 || withinCone(center, p.state.Yaw, e.Cone, at)
	}
	if e.Affects == "enemies" {
		for _, d := range l.dummies {
			if d.state.Continent != p.state.Continent {
				continue
			}
			if gap, ok := inside(d.state.At); ok {
				found = append(found, reach{&d.vitals, gap})
			}
		}
	} else if e.Affects == "allies" {
		for _, o := range l.players {
			if o.state.Continent != p.state.Continent {
				continue
			}
			if gap, ok := inside(o.state.At); ok {
				found = append(found, reach{&o.fight.vitals, gap})
			}
		}
	}
	slices.SortFunc(found, func(a, b reach) int {
		if a.gap != b.gap {
			if a.gap < b.gap {
				return -1
			}
			return 1
		}
		return int(a.v.ID - b.v.ID)
	})
	if e.Max > 0 && len(found) > e.Max {
		found = found[:e.Max]
	}
	out := make([]*vitals, len(found))
	for i, r := range found {
		out[i] = r.v
	}
	return out
}

func (l *Layer) dummy(id int64, continent string) *dummy {
	for _, d := range l.dummies {
		if d.ID == id && (continent == "" || d.state.Continent == continent) {
			return d
		}
	}
	return nil
}

// tell sends a message to a player and those near it.
func (l *Layer) tell(p *Player, b []byte) {
	p.send(b)
	for _, o := range l.near(p) {
		o.send(b)
	}
}

// stopCast ends what a player's casting.
func (l *Layer) stopCast(p *Player) {
	f := &p.fight
	if f.cast == nil {
		return
	}
	f.cast.stopped = true
	f.cast = nil
	l.tell(p, encode(stopped{"stopped", p.ID()}))
}

// interruptMoving ends a cast its caster has moved during.
func (l *Layer) interruptMoving(p *Player) {
	if c := p.fight.cast; c != nil && !c.ability.CastWhileMoving && movingNow(p.state.Move) {
		l.stopCast(p)
	}
}

// Tick moves combat on: casts let go, what's due lands, resources come back and dummies reset.
func (h *Hub) Tick() {
	h.mu.Lock()
	layers := make([]*Layer, 0, len(h.layers))
	for _, l := range h.layers {
		layers = append(layers, l)
	}
	h.mu.Unlock()
	now := h.now()
	for _, l := range layers {
		l.mu.Lock()
		l.tick(now)
		l.mu.Unlock()
	}
}

func (l *Layer) tick(now time.Time) {
	dt := 0.0
	if !l.lastTick.IsZero() {
		dt = now.Sub(l.lastTick).Seconds()
	}
	l.lastTick = now
	for _, p := range l.players {
		f := &p.fight
		if c := f.cast; c != nil {
			if !c.released && !now.Before(c.release) {
				l.release(p, c, now)
			} else if c.released && !now.Before(c.ends) {
				f.cast = nil
			}
		}
		l.swing(p, now)
		l.regen(p, dt, now)
	}
	// Landings can add landings, so go by index.
	var later []*landing
	for i := 0; i < len(l.landings); i++ {
		a := l.landings[i]
		if a.cast != nil && a.cast.stopped {
			continue
		}
		if now.Before(a.at) {
			later = append(later, a)
			continue
		}
		a.run(now)
	}
	l.landings = later
	for _, d := range l.dummies {
		if !d.lastHit.IsZero() && now.Sub(d.lastHit) >= dummyResetIdle {
			d.firstHit, d.lastHit, d.damage = time.Time{}, time.Time{}, 0
			d.Health, d.state.Health = d.MaxHealth, d.MaxHealth
			for _, o := range l.players {
				if o.state.Continent == d.state.Continent {
					o.send(encode(healthMessage{"health", d.ID, d.Health, d.MaxHealth}))
				}
			}
		}
		for id := range expire(&d.vitals, now) {
			l.tellOf(d.ID, encode(statusGone{"statusGone", d.ID, id}))
		}
	}
	for _, p := range l.players {
		for id := range expire(&p.fight.vitals, now) {
			l.tell(p, encode(statusGone{"statusGone", p.ID(), id}))
		}
	}
}

// expire takes off the statuses that have run out, and returns them.
func expire(v *vitals, now time.Time) map[string]bool {
	gone := map[string]bool{}
	for id, s := range v.Statuses {
		if !s.until.IsZero() && !now.Before(s.until) {
			delete(v.Statuses, id)
			gone[id] = true
		}
	}
	return gone
}

// regen brings back resources and tells the player how they stand, every so often.
func (l *Layer) regen(p *Player, dt float64, now time.Time) {
	f := &p.fight
	if f.class == nil {
		return
	}
	for _, r := range f.class.Resources {
		was := f.resources[r.Key]
		f.resources[r.Key] = max(0, min(combat.MaxResource(r), was+combat.RegenOf(r)*dt))
		if f.resources[r.Key] != was {
			f.resChanged = true
		}
	}
	if f.resChanged && now.Sub(f.sentAt) >= resourceEvery {
		out, most := map[string]float64{}, map[string]float64{}
		for _, r := range f.class.Resources {
			out[r.Key], most[r.Key] = math.Round(f.resources[r.Key]), combat.MaxResource(r)
		}
		p.send(encode(resources{"resources", out, most}))
		f.sentAt, f.resChanged = now, false
	}
}

func movingNow(m Move) bool { return m.Forward != 0 || m.Strafe != 0 || m.Jump }

// live is the times in list still to come.
func live(list []time.Time, now time.Time) []time.Time {
	out := list[:0:0]
	for _, t := range list {
		if t.After(now) {
			out = append(out, t)
		}
	}
	return out
}

func seconds(s float64) time.Duration { return time.Duration(s * float64(time.Second)) }

func distance(a, b [3]float64) float64 {
	return math.Hypot(math.Hypot(a[0]-b[0], a[2]-b[2]), a[1]-b[1])
}

// facing says whether `at` is in the half circle in front of someone at `from` facing `yaw`.
func facing(from [3]float64, yaw float64, at [3]float64) bool {
	return math.Sin(yaw)*(at[0]-from[0])+math.Cos(yaw)*(at[2]-from[2]) >= 0
}

// withinCone says whether `at` is within a cone `degrees` wide, opening from `from` the way `yaw`
// faces.
func withinCone(from [3]float64, yaw, degrees float64, at [3]float64) bool {
	dx, dz := at[0]-from[0], at[2]-from[2]
	length := math.Hypot(dx, dz)
	if length == 0 {
		return true
	}
	cos := (math.Sin(yaw)*dx + math.Cos(yaw)*dz) / length
	return cos >= math.Cos(degrees/2*math.Pi/180)
}
