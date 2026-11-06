package game

import (
	"cmp"
	"log"
	"slices"
	"strings"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// Using abilities: checking a use, paying for it, casts and channels, and what lands when.

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
	l.stopLoggingOff(p, "you used an ability")
	l.breakStatuses(&f.vitals, "action", func(s *combat.Status) bool { return s.KeptBy.Keeps(ability) })
	gcd := combat.GCDSeconds
	if ability.GCD != nil {
		gcd = *ability.GCD
	}
	if gcd > 0 {
		f.gcdUntil = now.Add(seconds(gcd))
	}
	l.tell(p, encode(used{Type: "used", ID: p.ID(), Class: f.class.ID, Ability: ability.ID, Target: target, Spot: m.Spot, GCD: gcd, CastTime: ability.CastTime, Channel: ability.Channel, Cost: ability.Cost, School: ability.School, Schools: ability.Schools, Animation: ability.Animation}))
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

// inForce is the ability a use of this one comes to: a `modify`'s `becomes` can turn it into another.
func (l *Layer) inForce(p *Player, a *combat.Ability, now time.Time) *combat.Ability {
	f := &p.fight
	for _, m := range l.modifiersOf(&f.vitals, now) {
		if e := m.Effect; e.Becomes != "" && e.Picks(a) && l.holds(&f.vitals, e, nil, now) {
			if to := f.class.Ability(e.Becomes); to != nil {
				return to
			}
		}
	}
	return a
}

// castNow does a `castAbility`: another of the class's abilities, at once.
func (l *Layer) castNow(p *Player, c *casting, e *combat.Effect, on *vitals, now time.Time) {
	f := &p.fight
	if c.depth >= maxCastDepth || f.level < e.Level {
		return
	}
	found := f.class.Ability(e.Ability)
	if found == nil {
		log.Printf("character %d: ability %s casts one its class hasn't got: %s", p.ID(), c.ability.ID, e.Ability)
		return
	}
	a := *l.resolved(p, found, now)
	if e.Strength != 0 && e.Strength != 1 {
		a.Effects = slices.Clone(a.Effects)
		for i := range a.Effects {
			a.Effects[i].Amount = a.Effects[i].Amount.Grown(e.Strength)
		}
	}
	if e.Free {
		a.Cost = nil
	}
	if why := l.affordable(p, &a, on.ID, now); why != "" {
		p.debugLine("%s: %s: %s", c.ability.Name, a.Name, why)
		return
	}
	inner := &casting{ability: &a, target: on.ID, spot: c.spot, depth: c.depth + 1}
	for _, cost := range a.Cost {
		if l.costCounts(p, cost, on.ID, now) {
			spent := spendFor(f, &a, cost)
			f.resources[cost.Resource] -= spent
			f.resChanged = true
			countSpent(f, inner, cost, spent)
		}
	}
	inner.spent = countedSpent(f, inner)
	l.tell(p, encode(used{Type: "used", ID: p.ID(), Class: f.class.ID, Ability: a.ID, Target: on.ID, Spot: c.spot, School: a.School, Schools: a.Schools, Animation: a.Animation}))
	l.landWhich(p, inner, now, func(*combat.Effect) bool { return true })
}

// modifiersOf is the `modify` effects that count for a unit right now.
func (l *Layer) modifiersOf(v *vitals, now time.Time) []combat.Mod {
	// What you gained last goes last, so with several `overrides` it wins. Statuses are held in a
	// map, so ties go by id.
	held := make([]statusKey, 0, len(v.Statuses))
	for key := range v.Statuses {
		held = append(held, key)
	}
	slices.SortFunc(held, func(a, b statusKey) int {
		if n := v.Statuses[a].since.Compare(v.Statuses[b].since); n != 0 {
			return n
		}
		if n := strings.Compare(a.id, b.id); n != 0 {
			return n
		}
		return cmp.Compare(a.from, b.from)
	})
	var mods []combat.Mod
	for _, key := range held {
		each := v.Statuses[key]
		for i := range each.def.Effects {
			if e := &each.def.Effects[i]; e.Type == "modify" && l.holds(v, e, nil, now) {
				mods = append(mods, combat.Mod{Effect: e, Stacks: each.stacks})
			}
		}
	}
	return mods
}

// resolved is an ability as this player would use it now.
func (l *Layer) resolved(p *Player, a *combat.Ability, now time.Time) *combat.Ability {
	f := &p.fight.vitals
	mods := l.modifiersOf(f, now)
	sheet := l.statsOf(f, nil, now)
	for i := range mods {
		mods[i].Mastery = sheet.MasteryPercent()
	}
	if len(mods) > 0 {
		a = p.fight.class.Resolve(a, mods, sheet.MasteryPercent(), l.hub.roll)
	}
	if sheet.Haste() == 0 {
		return a
	}
	hasted := *a
	if a.CooldownHasted {
		hasted.Cooldown = sheet.Hasted(a.Cooldown)
	}
	hasted.CastTime = sheet.Hasted(a.CastTime)
	if a.Channel != nil {
		channel := *a.Channel
		channel.Duration = sheet.Hasted(channel.Duration)
		hasted.Channel = &channel
	}
	gcd := combat.GCDSeconds
	if a.GCD != nil {
		gcd = *a.GCD
	}
	if gcd > 0 && (a.GCDHasted == nil || *a.GCDHasted) {
		gcd = max(sheet.Hasted(gcd), combat.LowestGCD)
		hasted.GCD = &gcd
	}
	return &hasted
}

// check says whether a player can use an ability now: the ability and its target, or why not.
func (l *Layer) check(p *Player, m incoming, now time.Time) (*combat.Ability, int64, string) {
	f := &p.fight
	if f.class == nil {
		return nil, 0, "you have no class"
	}
	ability := f.class.Ability(m.Ability)
	if ability == nil || !f.class.Knows(ability, f.level, f.build) {
		return nil, 0, "you don't know that"
	}
	ability = l.resolved(p, l.inForce(p, ability, now), now)
	if f.cast != nil && !ability.WhileCasting {
		return nil, 0, "you're busy"
	}
	gcd := combat.GCDSeconds
	if ability.GCD != nil {
		gcd = *ability.GCD
	}
	if gcd > 0 && now.Before(f.gcdUntil) {
		return nil, 0, "not ready yet"
	}
	if !slices.Contains(ability.Ignores, "cooldown") && len(live(f.cooldowns[ability.ID], now)) >= max(ability.Charges, 1) {
		return nil, 0, "not ready yet"
	}
	if why := combat.Blocked(l.controlsOn(&f.vitals), ability); why != "" {
		return nil, 0, why
	}
	if lockedOut(f, ability, now) {
		return nil, 0, "that school is locked out"
	}
	if why := l.affordable(p, ability, m.Target, now); why != "" {
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
		if l.untargetable(&d.vitals, now) {
			return nil, 0, "you can't target that"
		}
		target, at = d.ID, d.state.At
	case "ally", "any":
		if d := l.dummy(m.Target, p.state.Continent); d != nil && ability.Target == "any" {
			if l.untargetable(&d.vitals, now) {
				return nil, 0, "you can't target that"
			}
			target, at = d.ID, d.state.At
			break
		}
		o := l.players[m.Target]
		if o == nil || o.state.Continent != p.state.Continent {
			o = p // with no one else targeted, it goes on you
		}
		if o != p && l.untargetable(&o.fight.vitals, now) {
			return nil, 0, "you can't target that"
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
	if target != p.ID() && !l.sees(p.state.Continent, p.state.At, at) {
		return nil, 0, cantSee
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
func (l *Layer) affordable(p *Player, a *combat.Ability, target int64, now time.Time) string {
	f := &p.fight
	for _, cost := range a.Cost {
		if l.costCounts(p, cost, target, now) && f.resources[cost.Resource] < costOf(f, cost) {
			return "not enough " + cost.Resource
		}
	}
	return ""
}

// costCounts says whether a cost's conditions hold.
func (l *Layer) costCounts(p *Player, cost combat.Cost, target int64, now time.Time) bool {
	if len(cost.When) == 0 {
		return true
	}
	_, ok := combat.All(cost.When, l.facts(p, target, now))
	return ok
}

// spendFor is what a use takes of a cost, which can be more than the least it needs.
func spendFor(f *fighter, a *combat.Ability, cost combat.Cost) float64 {
	least, have := costOf(f, cost), f.resources[cost.Resource]
	switch {
	case cost.All:
		return have
	case cost.UpTo > 0 || a.SpendsUpTo > 0:
		return max(least, min(have, max(cost.UpTo, least)+a.SpendsUpTo))
	}
	return least
}

// countSpent notes how many points a use spent, for what goes by that, and how far past the least
// its open-ended cost went, as a share.
func countSpent(f *fighter, c *casting, cost combat.Cost, spent float64) {
	a := c.ability
	open := cost.All || cost.UpTo > 0 || a.SpendsUpTo > 0
	if open && !c.spentOpen {
		c.spent, c.spentOpen = 0, true
	}
	if open || !c.spentOpen {
		c.spent += spent
	}
	if !open {
		return
	}
	least := costOf(f, cost)
	top := max(cost.UpTo, least) + a.SpendsUpTo
	if top > least {
		c.extra = min((spent-least)/(top-least), 1)
	}
}

// countedSpent is what a use counts as having spent, after what a `modify` says.
func countedSpent(f *fighter, c *casting) float64 {
	a := c.ability
	if a.SpentAsMax {
		most := 0.0
		for _, r := range f.class.Resources {
			for _, cost := range a.Cost {
				if cost.Resource == r.Key {
					most = max(most, f.pool(r).Max)
				}
			}
		}
		return most
	}
	if a.SpentAs != 0 {
		return a.SpentAs
	}
	return c.spent
}

// amountOf is what an effect's amount comes to in this use, with what it spent.
func amountOf(c *casting, e *combat.Effect, count int) combat.Amount {
	out := e.AmountFor(count).Spending(c.spent)
	by := e.ByExtraSpent
	if c.ability.ByExtraSpent != 0 {
		by = c.ability.ByExtraSpent
	}
	if by != 0 && c.extra > 0 {
		out = out.Grown(1 + (by-1)*c.extra)
	}
	return out
}

// chanceHolds rolls an effect's `chance`, if it has one.
func (l *Layer) chanceHolds(c *casting, e *combat.Effect) bool {
	if e.Chance == nil && e.ChancePerSpent == 0 {
		return true
	}
	chance := 1.0
	if e.Chance != nil {
		chance = *e.Chance
	}
	return l.hub.roll() < chance+e.ChancePerSpent*c.spent
}

// payForTick takes what a channel costs each tick, and says whether it could.
func (l *Layer) payForTick(p *Player, c *casting, ticks int) bool {
	f, a := &p.fight, c.ability
	type due struct {
		resource string
		amount   float64
	}
	var owed []due
	for _, cost := range a.Cost {
		if cost.PerSecond > 0 {
			owed = append(owed, due{cost.Resource, cost.PerSecond * a.Channel.Duration / float64(ticks)})
		}
	}
	if each := a.Channel.CostPerTick; each != nil {
		owed = append(owed, due{each.Resource, each.Amount})
	}
	for _, each := range owed {
		if f.resources[each.resource] < each.amount {
			p.send(encode(refused{"refused", a.ID, "not enough " + each.resource}))
			return false
		}
	}
	for _, each := range owed {
		f.resources[each.resource] -= each.amount
		f.resChanged = true
	}
	return true
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

// castOf is an ability being used, as what's watching sees it.
func castOf(a *combat.Ability) *combat.HitContext {
	return &combat.HitContext{Schools: schoolsOf("", nil, a), Ability: a, Kinds: []string{"ability"}}
}

// release lets go of a cast: it spends what the ability costs, starts its cooldown, and sets off
// what lands.
func (l *Layer) release(p *Player, c *casting, now time.Time) {
	f := &p.fight
	a := c.ability
	c.released = true
	why := l.affordable(p, a, c.target, now)
	if why == "" && !c.channel && a.Target != "self" && !l.seesCast(p, c) {
		why = cantSee
	}
	if why != "" {
		if f.cast == c {
			f.cast = nil
		}
		p.send(encode(refused{"refused", a.ID, why}))
		l.tell(p, encode(stopped{"stopped", p.ID()}))
		return
	}
	for _, cost := range a.Cost {
		if !l.costCounts(p, cost, c.target, now) {
			continue
		}
		spent := spendFor(f, a, cost)
		if spent == 0 {
			continue
		}
		f.resources[cost.Resource] -= spent
		f.resChanged = true
		countSpent(f, c, cost, spent)
		p.debugLine("%s: spent %g %s", a.Name, spent, cost.Resource)
		l.fire(event{on: "spend", who: &f.vitals, other: c.target, ctx: castOf(a), amount: spent, resource: cost.Resource}, now)
	}
	c.spent = countedSpent(f, c)
	l.fire(event{on: "cast", who: &f.vitals, other: c.target, ctx: castOf(a)}, now)
	if a.Cooldown > 0 {
		spent := live(f.cooldowns[a.ID], now)
		from := now
		if len(spent) > 0 {
			from = spent[len(spent)-1]
		}
		f.cooldowns[a.ID] = append(spent, from.Add(seconds(a.Cooldown)))
		p.send(encode(cooldown{"cooldown", a.ID, readyIn(f, a, now)}))
	}
	used := usedBy(f, a)
	if c.channel {
		l.spend(p, used, now)
		f.cast = c
		ticks := max(a.Channel.Ticks, 1)
		for n := 1; n <= ticks; n++ {
			at := now.Add(seconds(a.Channel.Duration * float64(n) / float64(ticks)))
			l.after(at, c, func(now time.Time) {
				if !l.payForTick(p, c, ticks) {
					l.stopCast(p)
					return
				}
				l.landAll(p, c, now, false)
			})
		}
		l.after(now.Add(seconds(a.Channel.Duration)), c, func(now time.Time) {
			l.fire(event{on: "channelEnd", who: &f.vitals, other: c.target, ctx: castOf(a)}, now)
		})
		return
	}
	if f.cast == c {
		f.cast = nil
	}
	if a.ID == combat.HomewardID {
		l.goHome(p)
		return
	}
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
	l.after(strike, nil, func(now time.Time) { l.spend(p, used, now) })
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
		count  int // how many it reached
	}
	var plan []landingOn
	for i := range c.ability.Effects {
		e := &c.ability.Effects[i]
		if !which(e) {
			continue
		}
		var reached []*vitals
		if e.Type != "area" {
			reached = l.reached(p, c, e)
			if len(reached) == 0 {
				p.debugLine("%s: %s reached no one", c.ability.Name, e.Type)
			}
		}
		if e.Type == "area" {
			if failed, ok := combat.All(e.When, l.facts(p, c.target, now)); ok {
				l.placeArea(p, c, e, now)
			} else {
				p.debugLine("%s: area skipped: %s", c.ability.Name, failed.Why(statusNames(p)))
			}
			continue
		}
		for _, on := range reached {
			target := c.target
			if e.Affects == "enemies" || e.Affects == "allies" {
				target = on.ID // an area's conditions ask about each one it reaches
			}
			if failed, ok := combat.All(e.When, l.factsInUse(p, c, target, len(reached), now)); !ok {
				p.debugLine("%s: %s skipped: %s", c.ability.Name, e.Type, failed.Why(statusNames(p)))
				continue
			}
			plan = append(plan, landingOn{e, on, len(reached)})
		}
	}
	for _, each := range plan {
		// How a hit went is only known once it's landed, so what asks about that waits till now.
		if slices.ContainsFunc(each.effect.When, func(w combat.Condition) bool { return w.Outcome != "" }) {
			if _, ok := combat.All(each.effect.When, l.factsInUse(p, c, each.on.ID, each.count, now)); !ok {
				continue
			}
		}
		l.land(p, c, each.effect, each.on, each.count, now)
	}
}

// unmet says why a player can't use an ability on a target, going by its `requires`.
func (l *Layer) unmet(p *Player, a *combat.Ability, target int64, now time.Time) string {
	if slices.Contains(a.Ignores, "requires") {
		return ""
	}
	if failed, ok := combat.All(a.Requires, l.facts(p, target, now)); !ok {
		return failed.Why(statusNames(p))
	}
	return ""
}

// usedBy finds the statuses that using an ability spends.
func usedBy(f *fighter, a *combat.Ability) []usingUp {
	var out []usingUp
	for key, each := range f.vitals.Statuses {
		if each.def.ConsumedBy.Matches(a) {
			out = append(out, usingUp{key, each})
		}
	}
	return out
}

// spend takes a use or stacks from statuses an ability used, unless they've been put on afresh since.
func (l *Layer) spend(p *Player, used []usingUp, now time.Time) {
	if l.players[p.ID()] != p {
		return
	}
	on := &p.fight.vitals
	for _, u := range used {
		if on.Statuses[u.key] != u.held {
			continue
		}
		l.fire(statusEvent("statusConsumed", on, u.key, u.held), now)
		if n := u.held.def.ConsumedBy.Stacks; n > 0 {
			u.held.stacks -= n
			if u.held.stacks > 0 {
				l.statusChanged(on.ID, u.key, u.held, now)
				continue
			}
		} else if u.held.uses--; u.held.uses > 0 {
			continue
		}
		l.takeOff(on, u.key)
		p.debugLine("%s is used up", u.held.def.Name)
	}
}

// reached is who an effect lands on.
func (l *Layer) reached(p *Player, c *casting, e *combat.Effect) []*vitals {
	switch e.Affects {
	case "self":
		return []*vitals{&p.fight.vitals}
	case "target":
		if c.ability.Target != "enemy" && c.ability.Target != "ally" && c.ability.Target != "any" {
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
	way := [2]float64{}
	if e.Line {
		way = lineWay(p, c, e, center)
	}
	a := areaOf{center: center, continent: p.state.Continent, yaw: p.state.Yaw, affects: e.Affects, radius: e.Radius, cone: e.Cone, line: e.Line, width: e.Width, dir: way, most: e.Max, prefers: e.Prefers, from: p.ID(), holding: e.Holding}
	if e.Type != "move" {
		a.height = e.Height
	}
	if e.ExceptTarget {
		a.except = c.target
	}
	return l.inArea(a)
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

// interruptMoving ends a cast its caster has moved during, and the statuses that break on moving.
func (l *Layer) interruptMoving(p *Player) {
	if c := p.fight.cast; c != nil && !c.ability.CastWhileMoving && movingNow(p.state.Move) {
		l.stopCast(p)
	}
	if movingNow(p.state.Move) {
		l.breakStatuses(&p.fight.vitals, "move", nil)
		l.stopLoggingOff(p, "you moved")
	}
}
