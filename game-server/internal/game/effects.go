package game

import (
	"cmp"
	"math"
	"slices"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// What an ability's effects do as they land: damage and healing, dispels, interrupts, cooldowns, consuming and extending statuses.

// land does one effect to one unit. Effects that aren't here yet do nothing.
func (l *Layer) land(p *Player, c *casting, e *combat.Effect, on *unit, count int, now time.Time) {
	if !l.chanceHolds(c, e) {
		return
	}
	h := hit{Type: "hit", From: p.ID(), Ability: c.ability.ID, On: on.ID, Effect: e.Type}
	switch e.Type {
	case "damage":
		ctx := hitOf(c, e, on, count)
		l.critRules(p, e, on, &ctx, now)
		l.strike(p, on, l.amountFor(p, c, e, on, count, now), ctx, &h, now)
		if !h.Missed {
			c.landed, c.crit, c.survived = true, h.Crit, on.Health > 0
			l.drain(p, h.Amount, e.Drain, c.ability.ID)
			c.lastDone = h.Amount
			if center, continent, ok := l.unitAt(on.ID, [3]float64{}, ""); ok {
				defer l.spill(p, c, e, on, center, continent, h.Amount, count, now)
			}
		}
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
	case "cooldown":
		l.changeCooldowns(p, c, e, now)
		return
	case "dispel":
		l.dispel(p, c, e, on, now)
		return
	case "castAbility":
		l.castNow(p, c, e, on, now)
		return
	case "move":
		l.forceMove(p, c, e, on, now)
		return
	case "interrupt":
		if !l.interrupt(p, e, on, &h, now) {
			p.debugLine("%s: %s isn't casting", c.ability.Name, l.nameOf(on.ID))
			return
		}
	case "heal":
		healing := hitOf(c, e, on, count)
		l.critRules(p, e, on, &healing, now)
		n, crit := l.rollHeal(p, on, l.amountFor(p, c, e, on, count, now), healing, now)
		c.lastDone = n
		over := max(on.Health+n-on.MaxHealth, 0)
		on.Health = min(on.Health+n, on.MaxHealth)
		h.Amount, h.Crit = math.Round(n), crit
		ctx := hitOf(c, e, on, count)
		defer l.healedBy(p, on, n, over, ctx, now)
	case "resource":
		n, _ := combat.Roll(l.amountFor(p, c, e, on, count, now), l.statsOf(&p.fight.unit, nil, now), false, l.hub.roll)
		if given, ok := l.addResource(&p.fight, e.Resource, n); ok {
			h.Amount, h.Resource = math.Round(given), e.Resource
		}
	case "status":
		duration := e.Duration
		if e.DurationPerSpent != 0 {
			if duration == 0 {
				if s := p.fight.class.Status(e.Status); s != nil {
					duration = s.Duration
				}
			}
			duration += e.DurationPerSpent * c.spent
		}
		if !l.applyStatus(p, c.ability, e.Status, duration, on, &h, now) {
			return
		}
		if held := on.Statuses[statusKey{e.Status, p.ID()}]; held != nil {
			held.spent = c.spent
			var given *combat.Amount
			if e.Amount != (combat.Amount{}) {
				worked := l.amountFor(p, c, e, on, count, now)
				given = &worked
			}
			l.startAbsorb(p, held, given, on, now)
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

// dispel takes statuses off a unit by kind, control or tag, up to `count`, oldest first. It takes
// what harms a friend, and what helps an enemy.
func (l *Layer) dispel(p *Player, c *casting, e *combat.Effect, on *unit, now time.Time) {
	keeps := "buff"
	if on.ID < 0 { // only dummies are enemies so far
		keeps = "debuff"
	}
	var found []statusKey
	for key, held := range on.Statuses {
		if held.def.Kind != keeps && held.def.Dispelled(e) {
			found = append(found, key)
		}
	}
	slices.SortFunc(found, func(a, b statusKey) int {
		return cmp.Or(on.Statuses[a].since.Compare(on.Statuses[b].since), cmp.Compare(a.id, b.id), cmp.Compare(a.from, b.from))
	})
	if len(found) == 0 {
		p.debugLine("%s: %s has nothing it removes", c.ability.Name, l.nameOf(on.ID))
	}
	for _, key := range found[:min(max(e.Count, 1), len(found))] {
		held := on.Statuses[key]
		if held == nil {
			continue // something ending just now took this one with it
		}
		l.fire(event{on: "dispel", who: &p.fight.unit, other: on.ID, ctx: castOf(c.ability), status: key.id, stacks: held.stacks}, now)
		l.fire(statusEvent("dispelled", on, key, held), now)
		if on.Statuses[key] != held {
			continue
		}
		l.takeOff(on, key)
		p.debugLine("%s: took %s off %s", c.ability.Name, key.id, l.nameOf(on.ID))
		l.tell(p, encode(hit{Type: "hit", From: p.ID(), Ability: c.ability.ID, On: on.ID, Effect: e.Type, Removed: key.id, Class: held.class, Health: math.Round(on.Health), MaxHealth: on.MaxHealth}))
	}
}

// interrupt stops a player's cast and locks it out of the cast's school. It says whether there was one.
func (l *Layer) interrupt(p *Player, e *combat.Effect, on *unit, h *hit, now time.Time) bool {
	o := l.playerOf(on)
	if o == nil || o.fight.cast == nil {
		return false
	}
	if l.immuneTo(on, "interrupt", now) {
		h.Missed, h.Avoided = true, "immune"
		return true
	}
	f := &o.fight
	stopped := f.cast.ability
	l.stopCast(o)
	for _, school := range schoolsOf("", nil, stopped) {
		if e.Lockout > 0 {
			f.lockouts[school] = now.Add(seconds(e.Lockout))
			o.send(encode(lockout{"lockout", school, e.Lockout}))
		}
	}
	h.Stopped, h.Class = stopped.ID, f.class.ID
	l.fire(event{on: "interrupt", who: &p.fight.unit, other: on.ID, ctx: castOf(stopped)}, now)
	return true
}

func lockedOut(f *fighter, a *combat.Ability, now time.Time) bool {
	return slices.ContainsFunc(schoolsOf("", nil, a), func(school string) bool { return f.lockouts[school].After(now) })
}

// changeCooldowns does a `cooldown` effect, on the caster's own cooldowns, and tells it where they stand.
func (l *Layer) changeCooldowns(p *Player, c *casting, e *combat.Effect, now time.Time) {
	f := &p.fight
	for i := range f.class.Abilities {
		a := &f.class.Abilities[i]
		if !slices.Contains(e.Abilities, a.ID) && (e.Tag == "" || !slices.Contains(a.Tags, e.Tag)) {
			continue
		}
		spent := live(f.cooldowns[a.ID], now)
		if len(spent) == 0 {
			continue
		}
		f.cooldowns[a.ID] = sooner(spent, e, now)
		left := readyIn(f, l.resolved(p, a, now), now)
		p.debugLine("%s: %s is ready in %.1f s", c.ability.Name, a.Name, left)
		p.send(encode(cooldown{"cooldown", a.ID, left}))
	}
}

// sooner is an ability's spent charges after a `cooldown` effect. They come back one after another,
// so taking time off moves them all, and giving a charge back drops the last to come.
func sooner(spent []time.Time, e *combat.Effect, now time.Time) []time.Time {
	if e.Reset {
		return nil
	}
	moved := make([]time.Time, len(spent))
	for i, t := range spent {
		moved[i] = t.Add(-seconds(e.By))
	}
	moved = live(moved, now)
	return moved[:max(len(moved)-e.Charges, 0)]
}

// readyIn is how many seconds until an ability can be used, as far as its cooldown goes.
func readyIn(f *fighter, a *combat.Ability, now time.Time) float64 {
	spent := live(f.cooldowns[a.ID], now)
	charges := max(a.Charges, 1)
	if len(spent) < charges {
		return 0
	}
	return spent[len(spent)-charges].Sub(now).Seconds()
}

// consume takes statuses off a unit, or stacks or seconds of them, and does what that's worth.
func (l *Layer) consume(p *Player, c *casting, e *combat.Effect, on *unit, now time.Time) {
	for _, id := range e.StatusIDs() {
		key := statusKey{id, p.ID()}
		held := on.Statuses[key]
		if held == nil {
			p.debugLine("%s: %s has no %s to consume", c.ability.Name, l.nameOf(on.ID), id)
			continue
		}
		l.fire(statusEvent("statusConsumed", on, key, held), now)
		if on.Statuses[key] != held {
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
			l.dealLeft(p, c, id, held, e.DealsLeft, taken, window, on, now)
		}
		switch {
		case e.Keeps:
			p.debugLine("%s: %s keeps %s", c.ability.Name, l.nameOf(on.ID), id)
		case e.Stacks > 0 && taken < held.stacks:
			held.stacks -= taken
			l.statusChanged(on.ID, key, held, now)
			p.debugLine("%s: took %d stacks of %s off %s, %d left", c.ability.Name, taken, id, l.nameOf(on.ID), held.stacks)
		case e.Seconds > 0 && !held.until.IsZero() && window < held.until.Sub(now):
			held.until = held.until.Add(-window)
			l.statusChanged(on.ID, key, held, now)
			p.debugLine("%s: took %g s of %s off %s", c.ability.Name, window.Seconds(), id, l.nameOf(on.ID))
		case e.Seconds > 0 && held.until.IsZero():
			p.debugLine("%s: %s has no time to take off %s", c.ability.Name, id, l.nameOf(on.ID))
		default:
			l.takeOff(on, key)
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
func (l *Layer) landNested(p *Player, c *casting, e *combat.Effect, on *unit, now time.Time) {
	if e.Affects == "" {
		l.land(p, c, e, on, 1, now)
		return
	}
	reached := l.reached(p, c, e)
	for _, each := range reached {
		l.land(p, c, e, each, len(reached), now)
	}
}

// dealLeft does a share of what a status had left to do over a stretch of its time, all at once.
func (l *Layer) dealLeft(p *Player, c *casting, id string, held *activeStatus, share float64, stacks int, window time.Duration, on *unit, now time.Time) {
	for i, each := range held.def.Effects {
		period := held.def.Period(&each)
		if each.Type != "periodic" || period <= 0 {
			continue
		}
		next, ok := held.ticks[i]
		if !ok {
			next = held.since.Add(seconds(period))
		}
		ticks := 0
		if gap := next.Sub(now); gap <= window {
			ticks = 1 + int((window-gap).Seconds()/period)
		}
		if ticks == 0 {
			continue
		}
		ctx := combat.HitContext{Schools: schoolsOf(each.School, nil, c.ability), Category: each.Category, Status: id, Kinds: []string{"periodic"}}
		total, crit := 0.0, false
		for n := 0; n < ticks*stacks; n++ {
			rolled, critical := 0.0, false
			switch each.Does {
			case "damage":
				rolled, critical = l.rollDamage(p, on, each.Amount, ctx, now)
			case "heal":
				rolled, critical = l.rollHeal(p, on, each.Amount, ctx, now)
			}
			total += rolled
			crit = crit || critical
		}
		total *= share
		h := hit{Type: "hit", From: p.ID(), Ability: c.ability.ID, On: on.ID, Effect: each.Does, Crit: crit}
		switch each.Does {
		case "damage":
			if l.immuneToDamage(on, ctx.Schools, now) {
				h.Missed, h.Avoided, h.Crit = true, "immune", false
				break
			}
			l.harm(p, on, l.soak(on, total, ctx.Schools, &h, now), &h, now)
			l.leech(p, on, total, ctx, c.ability.ID, now)
			l.drain(p, total, each.Drain, c.ability.ID)
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
		if each.Does == "damage" {
			l.damaged(p, on, total, crit, ctx, now)
		} else {
			l.healedBy(p, on, total, 0, ctx, now)
		}
	}
}

// extend adds time to statuses on a unit, starts them over, or puts them on if they're missing.
func (l *Layer) extend(p *Player, c *casting, e *combat.Effect, on *unit, now time.Time) {
	f := &p.fight
	for _, id := range e.StatusIDs() {
		s := f.class.Status(id)
		key := statusKey{id, p.ID()}
		held := on.Statuses[key]
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
		l.statusChanged(on.ID, key, held, now)
		p.debugLine("%s: %s on %s now has %g s left", c.ability.Name, id, l.nameOf(on.ID), held.until.Sub(now).Seconds())
	}
}

func earlier(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}
