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
func (cm *Combat) land(u *unit, c *casting, e *combat.Effect, on *unit, count int, now time.Time) {
	if !cm.chanceHolds(c, e) {
		return
	}
	h := hit{Type: "hit", From: u.ID, Ability: c.ability.ID, On: on.ID, Effect: e.Type}
	switch e.Type {
	case "damage":
		ctx := hitOf(c, e, on, count)
		cm.critRules(u, e, on, &ctx, now)
		cm.strike(u, on, cm.amountFor(u, c, e, on, count, now), ctx, &h, now)
		if !h.Missed {
			c.landed, c.crit, c.survived = true, h.Crit, on.Health > 0
			cm.drain(u, h.Amount, e.Drain, c.ability.ID)
			c.lastDone = h.Amount
			if center, continent, ok := cm.unitAt(on.ID, [3]float64{}, ""); ok {
				defer cm.spill(u, c, e, on, center, continent, h.Amount, count, now)
			}
		}
	case "consume":
		if e.Affects != "summons" {
			cm.consume(u, c, e, on, now)
			return
		}
		u.debugLine("%s: consume of summons does nothing yet", c.ability.Name)
		return
	case "extend":
		cm.extend(u, c, e, on, now)
		return
	case "cooldown":
		cm.changeCooldowns(u, c, e, now)
		return
	case "dispel":
		cm.dispel(u, c, e, on, now)
		return
	case "castAbility":
		cm.castNow(u, c, e, on, now)
		return
	case "move":
		cm.forceMove(u, c, e, on, now)
		return
	case "interrupt":
		if !cm.interrupt(u, e, on, &h, now) {
			u.debugLine("%s: %s isn't casting", c.ability.Name, cm.nameOf(on.ID))
			return
		}
	case "heal":
		healing := hitOf(c, e, on, count)
		cm.critRules(u, e, on, &healing, now)
		n, crit := cm.rollHeal(u, on, cm.amountFor(u, c, e, on, count, now), healing, now)
		c.lastDone = n
		over := max(on.Health+n-on.MaxHealth, 0)
		cm.state.setHealth(on, on.Health+n)
		h.Amount, h.Crit = math.Round(n), crit
		ctx := hitOf(c, e, on, count)
		defer cm.healedBy(u, on, n, over, ctx, now)
	case "resource":
		n, _ := combat.Roll(cm.amountFor(u, c, e, on, count, now), cm.statsOf(u, nil, now), false, cm.roll)
		if given, ok := cm.addResource(u.fight, e.Resource, n); ok {
			h.Amount, h.Resource = math.Round(given), e.Resource
		}
	case "status":
		duration := e.Duration
		if e.DurationPerSpent != 0 {
			if duration == 0 {
				if s := u.fight.class.Status(e.Status); s != nil {
					duration = s.Duration
				}
			}
			duration += e.DurationPerSpent * c.spent
		}
		if !cm.applyStatus(u, c.ability, e.Status, duration, on, &h, now) {
			return
		}
		if held := on.Statuses[statusKey{e.Status, u.ID}]; held != nil {
			held.spent = c.spent
			var given *combat.Amount
			if e.Amount != (combat.Amount{}) {
				worked := cm.amountFor(u, c, e, on, count, now)
				given = &worked
			}
			cm.startAbsorb(u, held, given, on, now)
		}
	default:
		u.debugLine("%s: %s does nothing yet", c.ability.Name, e.Type)
		return
	}
	u.debugLine("%s", cm.debugHit(u, c.ability.Name, e, on, h))
	cm.state.showHit(u.ID, on, h)
}

// dispel takes statuses off a unit by kind, control or tag, up to `count`, oldest first. It takes
// what harms a friend, and what helps an enemy.
func (cm *Combat) dispel(u *unit, c *casting, e *combat.Effect, on *unit, now time.Time) {
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
		u.debugLine("%s: %s has nothing it removes", c.ability.Name, cm.nameOf(on.ID))
	}
	for _, key := range found[:min(max(e.Count, 1), len(found))] {
		held := on.Statuses[key]
		if held == nil {
			continue // something ending just now took this one with it
		}
		cm.fire(event{on: "dispel", who: u, other: on.ID, ctx: castOf(c.ability), status: key.id, stacks: held.stacks}, now)
		cm.fire(statusEvent("dispelled", on, key, held), now)
		if on.Statuses[key] != held {
			continue
		}
		cm.takeOff(on, key)
		u.debugLine("%s: took %s off %s", c.ability.Name, key.id, cm.nameOf(on.ID))
		cm.state.showHit(u.ID, on, hit{Type: "hit", From: u.ID, Ability: c.ability.ID, On: on.ID, Effect: e.Type, Removed: key.id, Class: held.class})
	}
}

// interrupt stops a player's cast and locks it out of the cast's school. It says whether there was one.
func (cm *Combat) interrupt(u *unit, e *combat.Effect, on *unit, h *hit, now time.Time) bool {
	o := cm.state.playerUnit(on)
	if o == nil || o.fight.cast == nil {
		return false
	}
	if cm.immuneTo(on, "interrupt", now) {
		h.Missed, h.Avoided = true, "immune"
		return true
	}
	f := o.fight
	stopped := f.cast.ability
	cm.stopCast(on)
	for _, school := range schoolsOf("", nil, stopped) {
		if e.Lockout > 0 {
			f.lockouts[school] = now.Add(seconds(e.Lockout))
			o.send(encode(lockout{"lockout", school, e.Lockout}))
		}
	}
	h.Stopped, h.Class = stopped.ID, f.class.ID
	cm.fire(event{on: "interrupt", who: u, other: on.ID, ctx: castOf(stopped)}, now)
	return true
}

func lockedOut(f *fighter, a *combat.Ability, now time.Time) bool {
	return slices.ContainsFunc(schoolsOf("", nil, a), func(school string) bool { return f.lockouts[school].After(now) })
}

// changeCooldowns does a `cooldown` effect, on the caster's own cooldowns, and tells it where they stand.
func (cm *Combat) changeCooldowns(u *unit, c *casting, e *combat.Effect, now time.Time) {
	f := u.fight
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
		left := readyIn(f, cm.resolved(u, a, now), now)
		u.debugLine("%s: %s is ready in %.1f s", c.ability.Name, a.Name, left)
		u.send(encode(cooldown{"cooldown", a.ID, left}))
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
func (cm *Combat) consume(u *unit, c *casting, e *combat.Effect, on *unit, now time.Time) {
	for _, id := range e.StatusIDs() {
		key := statusKey{id, u.ID}
		held := on.Statuses[key]
		if held == nil {
			u.debugLine("%s: %s has no %s to consume", c.ability.Name, cm.nameOf(on.ID), id)
			continue
		}
		cm.fire(statusEvent("statusConsumed", on, key, held), now)
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
			cm.dealLeft(u, c, id, held, e.DealsLeft, taken, window, on, now)
		}
		switch {
		case e.Keeps:
			u.debugLine("%s: %s keeps %s", c.ability.Name, cm.nameOf(on.ID), id)
		case e.Stacks > 0 && taken < held.stacks:
			held.stacks -= taken
			cm.statusChanged(on.ID, key, held, now)
			u.debugLine("%s: took %d stacks of %s off %s, %d left", c.ability.Name, taken, id, cm.nameOf(on.ID), held.stacks)
		case e.Seconds > 0 && !held.until.IsZero() && window < held.until.Sub(now):
			held.until = held.until.Add(-window)
			cm.statusChanged(on.ID, key, held, now)
			u.debugLine("%s: took %g s of %s off %s", c.ability.Name, window.Seconds(), id, cm.nameOf(on.ID))
		case e.Seconds > 0 && held.until.IsZero():
			u.debugLine("%s: %s has no time to take off %s", c.ability.Name, id, cm.nameOf(on.ID))
		default:
			cm.takeOff(on, key)
			u.debugLine("%s: took %s off %s", c.ability.Name, id, cm.nameOf(on.ID))
		}
		if e.PerStack != nil {
			for n := 0; n < taken; n++ {
				cm.landNested(u, c, e.PerStack, on, now)
			}
		}
	}
}

// landNested lands an effect inside another, on the same unit unless it says who it affects.
func (cm *Combat) landNested(u *unit, c *casting, e *combat.Effect, on *unit, now time.Time) {
	if e.Affects == "" {
		cm.land(u, c, e, on, 1, now)
		return
	}
	reached := cm.reached(u, c, e)
	for _, each := range reached {
		cm.land(u, c, e, each, len(reached), now)
	}
}

// dealLeft does a share of what a status had left to do over a stretch of its time, all at once.
func (cm *Combat) dealLeft(u *unit, c *casting, id string, held *activeStatus, share float64, stacks int, window time.Duration, on *unit, now time.Time) {
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
				rolled, critical = cm.rollDamage(u, on, each.Amount, ctx, now)
			case "heal":
				rolled, critical = cm.rollHeal(u, on, each.Amount, ctx, now)
			}
			total += rolled
			crit = crit || critical
		}
		total *= share
		h := hit{Type: "hit", From: u.ID, Ability: c.ability.ID, On: on.ID, Effect: each.Does, Crit: crit}
		switch each.Does {
		case "damage":
			if cm.immuneToDamage(on, ctx.Schools, now) {
				h.Missed, h.Avoided, h.Crit = true, "immune", false
				break
			}
			cm.harm(u, on, cm.soak(on, total, ctx.Schools, &h, now), &h, now)
			cm.leech(u, on, total, ctx, c.ability.ID, now)
			cm.drain(u, total, each.Drain, c.ability.ID)
		case "heal":
			cm.state.setHealth(on, on.Health+total)
			h.Amount = math.Round(total)
		default:
			continue
		}
		u.debugLine("%s: %s had %d ticks left, %g %s", c.ability.Name, id, ticks*stacks, h.Amount, each.Does)
		cm.state.showHit(on.ID, on, h)
		if each.Does == "damage" {
			cm.damaged(u, on, total, crit, ctx, now)
		} else {
			cm.healedBy(u, on, total, 0, ctx, now)
		}
	}
}

// extend adds time to statuses on a unit, starts them over, or puts them on if they're missing.
func (cm *Combat) extend(u *unit, c *casting, e *combat.Effect, on *unit, now time.Time) {
	f := u.fight
	for _, id := range e.StatusIDs() {
		s := f.class.Status(id)
		key := statusKey{id, u.ID}
		held := on.Statuses[key]
		if held == nil {
			if !e.Apply {
				u.debugLine("%s: %s has no %s to extend", c.ability.Name, cm.nameOf(on.ID), id)
				continue
			}
			h := hit{Type: "hit", From: u.ID, Ability: c.ability.ID, On: on.ID, Effect: "status"}
			if cm.applyStatus(u, c.ability, id, e.Duration, on, &h, now) {
				u.debugLine("%s", cm.debugHit(u, c.ability.Name, &combat.Effect{Type: "status"}, on, h))
				cm.state.showHit(on.ID, on, h)
			}
			continue
		}
		if held.until.IsZero() {
			u.debugLine("%s: %s has no end to move", c.ability.Name, id)
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
		cm.statusChanged(on.ID, key, held, now)
		u.debugLine("%s: %s on %s now has %g s left", c.ability.Name, id, cm.nameOf(on.ID), held.until.Sub(now).Seconds())
	}
}

func earlier(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}
