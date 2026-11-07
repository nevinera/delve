package game

import (
	"bytes"
	"cmp"
	"log"
	"math"
	"slices"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// Statuses on units: putting them on, ticking, breaking and taking them off, and the immunities and controls they give.

// applyStatus puts a status on a unit and notes it in the hit. It says whether the class has that status.
func (l *Layer) applyStatus(u *unit, a *combat.Ability, id string, duration float64, on *unit, h *hit, now time.Time) bool {
	f := u.fight
	s := f.class.Status(id)
	if s == nil {
		log.Printf("character %d: ability %s applies a status its class hasn't got: %s", u.ID, a.ID, id)
		return false
	}
	mods := l.modifiersOf(&f.unit, now)
	mastery := 0.0
	if len(mods) > 0 {
		mastery = l.statsOf(&f.unit, nil, now).MasteryPercent()
	}
	s = f.class.ResolveStatus(s, duration, mods, mastery)
	if l.immuneToStatus(on, s, u.ID, now) {
		h.Missed, h.Avoided = true, "immune"
		return true
	}
	lasts := s.Duration
	key := statusKey{s.ID, u.ID}
	was := on.Statuses[key]
	if s.Group != "" {
		for other, each := range on.Statuses {
			if other != key && each.def.Group == s.Group {
				l.takeOff(on, other)
			}
		}
	}
	if s.Limit > 0 && was == nil {
		l.makeRoom(u, s)
	}
	held := &activeStatus{def: s, class: f.class.ID, owner: f.class, since: now, stacks: 1, uses: 1}
	if s.ConsumedBy != nil && s.ConsumedBy.Uses > 0 {
		held.uses = s.ConsumedBy.Uses
	}
	if was != nil {
		switch s.Stacking {
		case "stack":
			held.stacks = was.stacks + 1
			if s.MaxStacks > 0 {
				held.stacks = min(held.stacks, s.MaxStacks)
			}
		case "refresh":
			if lasts > 0 && !was.until.IsZero() {
				lasts += min(max(was.until.Sub(now).Seconds(), 0), lasts*refreshKeeps)
			}
		}
	}
	if lasts > 0 {
		held.until = now.Add(seconds(lasts))
	}
	if was != nil {
		held.ticks, held.fired, held.counts, held.zones = was.ticks, was.fired, was.counts, was.zones // putting it on again doesn't start these over
	}
	l.addStatus(on, key, held, now)
	l.fire(statusEvent("statusGained", on, key, held), now)
	h.Status, h.Lasts, h.Class, h.Stacks = s.ID, lasts, f.class.ID, held.stacks
	return true
}

// makeRoom takes a status off the oldest units holding it from a player, so one more stays within its limit.
func (l *Layer) makeRoom(u *unit, s *combat.Status) {
	key := statusKey{s.ID, u.ID}
	var holders []*unit
	for v := range l.units() {
		if v.Statuses[key] != nil {
			holders = append(holders, v)
		}
	}
	slices.SortFunc(holders, func(a, b *unit) int { return a.Statuses[key].since.Compare(b.Statuses[key].since) })
	for i := 0; i <= len(holders)-s.Limit; i++ {
		l.takeOff(holders[i], key)
	}
}

// takeOff removes a status from a unit, says so, and fires what watches for it ending.
func (l *Layer) takeOff(on *unit, key statusKey) {
	if held := l.removeStatus(on, key); held != nil {
		l.fire(statusEvent("statusEnds", on, key, held), l.hub.now())
	}
}

// dropFrom takes off everything a unit put on, when it leaves: nothing's left to carry it on or end it.
func (l *Layer) dropFrom(from int64) {
	for v := range l.units() {
		for key := range v.Statuses {
			if key.from == from {
				l.takeOff(v, key)
			}
		}
	}
}

// breakStatuses takes off a unit's statuses that end when this happens. Only an ability has anything to keep them on.
func (l *Layer) breakStatuses(on *unit, what string, kept func(*combat.Status) bool) {
	for key, each := range on.Statuses {
		if (slices.Contains(each.def.BreaksOn, what) || (what == "damage" && each.def.BreaksOnDamage())) && (kept == nil || !kept(each.def)) {
			l.takeOff(on, key)
		}
	}
}

// sweep takes off statuses that have run out or whose holder has gone too far from who put them
// on, and refits each unit to what it holds now.
func (l *Layer) sweep(now time.Time) {
	for v := range l.units() {
		at := v.char.At
		continent := v.char.Continent
		for key, each := range v.Statuses {
			l.tickStatus(v, key, each, at, continent, now)
			if v.Statuses[key] != each {
				continue
			}
			over := !each.until.IsZero() && !now.Before(each.until)
			if each.def.Leash > 0 && !over {
				from := l.players[key.from]
				over = from == nil || from.state.Continent != continent || distance(from.state.At, at) > each.def.Leash
			}
			if over {
				l.takeOff(v, key)
			}
		}
		l.refit(v, now)
	}
	l.sweepZones(now)
}

// tickStatus lands whatever's due of a status's periodic effects. A last tick due as it ends still lands.
func (l *Layer) tickStatus(v *unit, key statusKey, held *activeStatus, at [3]float64, continent string, now time.Time) {
	p := l.players[key.from]
	if p == nil {
		return
	}
	for i := range held.def.Effects {
		e := &held.def.Effects[i]
		if e.Type != "periodic" || held.def.Period(e) <= 0 {
			continue
		}
		period := l.statsOf(&p.fight.unit, nil, now).Hasted(held.def.Period(e))
		if held.ticks == nil {
			held.ticks = map[int]time.Time{}
		}
		next, ok := held.ticks[i]
		if !ok {
			next = held.since.Add(seconds(period))
		}
		for !now.Before(next) && (held.until.IsZero() || !next.After(held.until)) && v.Statuses[key] == held {
			l.tickOf(&p.fight.unit, v, key.id, held, e, at, continent, now)
			next = next.Add(seconds(period))
		}
		held.ticks[i] = next
	}
}

// tickOf lands one tick of a periodic effect, from the one who applied it. Ticks don't miss.
func (l *Layer) tickOf(u *unit, holder *unit, id string, held *activeStatus, e *combat.StatusEffect, at [3]float64, continent string, now time.Time) {
	targets := []*unit{holder}
	if e.Affects == "enemies" || e.Affects == "allies" {
		targets = l.around(e, at, continent)
	}
	amount := combat.Shared(e.Amount.Spending(held.spent), e.SoftCap, len(targets)).Scaled(float64(held.stacks))
	ctx := combat.HitContext{Schools: schoolsOf(e.School, e.Schools, nil), Category: e.Category, Status: id, Kinds: []string{"periodic"}}
	for _, on := range targets {
		h := hit{Type: "hit", From: u.ID, On: on.ID, Effect: e.Does, Ticked: id, Class: held.class}
		switch e.Does {
		case "damage":
			if on.ID != u.ID {
				u.fight.attacked(now)
			}
			if l.immuneToDamage(on, ctx.Schools, now) {
				continue
			}
			n, crit := l.rollDamage(u, on, amount, ctx, now)
			h.Crit = crit
			l.harm(u, on, l.soak(on, n, ctx.Schools, &h, now), &h, now)
			l.leech(u, on, n, ctx, "", now)
			l.drain(u, n, e.Drain, "")
			defer l.damaged(u, on, n, crit, ctx, now)
		case "heal":
			n, crit := l.rollHeal(u, on, amount, ctx, now)
			h.Crit = crit
			over := max(on.Health+n-on.MaxHealth, 0)
			l.setHealth(on, on.Health+n)
			h.Amount = math.Round(n)
			defer l.healedBy(u, on, n, over, ctx, now)
		case "resource":
			o := l.playerOf(on)
			if o == nil {
				continue
			}
			n, _ := combat.Roll(amount, l.statsOf(u, nil, now), false, l.hub.roll)
			given, ok := l.addResource(&o.fight, e.Resource, n)
			if !ok {
				continue
			}
			h.Amount, h.Resource = math.Round(given), e.Resource
		default:
			u.debugLine("%s: a periodic that does %s does nothing yet", id, e.Does)
			continue
		}
		u.debugLine("%s on %s ticks: %s %g", id, l.nameOf(on.ID), e.Does, h.Amount)
		l.showHit(on.ID, on, h)
	}
}

// around is who an area periodic reaches around its holder, nearest first.
func (l *Layer) around(e *combat.StatusEffect, at [3]float64, continent string) []*unit {
	type reach struct {
		v   *unit
		gap float64
	}
	var found []reach
	for v := range l.units() {
		there := v.char.At
		on := v.char.Continent
		isEnemy := v.ID < 0 // only dummies are enemies, for now
		if on != continent || isEnemy != (e.Affects == "enemies") {
			continue
		}
		if gap := distance(at, there); e.Radius <= 0 || gap <= e.Radius {
			found = append(found, reach{v, gap})
		}
	}
	slices.SortFunc(found, func(a, b reach) int {
		if n := cmp.Compare(a.gap, b.gap); n != 0 {
			return n
		}
		return cmp.Compare(a.v.ID, b.v.ID)
	})
	if e.Max > 0 && len(found) > e.Max {
		found = found[:e.Max]
	}
	out := make([]*unit, len(found))
	for i, each := range found {
		out[i] = each.v
	}
	return out
}

// statusChanged tells those near a unit how a status on it stands now.
func (l *Layer) statusChanged(unit int64, key statusKey, held *activeStatus, now time.Time) {
	lasts := 0.0
	if !held.until.IsZero() {
		lasts = held.until.Sub(now).Seconds()
	}
	l.tellOf(unit, encode(statusChanged{"statusChanged", unit, key.id, key.from, held.stacks, lasts}))
}

func shownOf(key statusKey, held *activeStatus, now time.Time) shownStatus {
	lasts := 0.0
	if !held.until.IsZero() {
		lasts = held.until.Sub(now).Seconds()
	}
	return shownStatus{key.id, key.from, held.class, held.stacks, lasts}
}

// refit brings what's kept from a unit's stats up to date: its most health, keeping the share it
// has, and a player's speed.
func (l *Layer) refit(v *unit, now time.Time) {
	o := l.playerOf(v)
	if look := lookOn(v); !bytes.Equal(look, v.lookShown) {
		v.lookShown = look
		l.tellOf(v.ID, encode(lookMessage{"look", v.ID, look}))
	}
	if left := math.Round(absorbOn(v)); left != v.absorbShown {
		v.absorbShown = left
		l.tellOf(v.ID, encode(absorbMessage{"absorb", v.ID, left}))
	}
	if len(v.Statuses) == 0 && v.MaxHealth == v.base.MaxHealth && !v.untargetable && (o == nil || (o.motion.settled() && len(o.fight.controls) == 0)) {
		return
	}
	if out := l.untargetable(v, now); out != v.untargetable {
		v.untargetable = out
		l.tellOf(v.ID, encode(targetable{"targetable", v.ID, !out}))
	}
	stats := l.statsOf(v, nil, now)
	if most := max(stats.MaxHealth, 1); most != v.MaxHealth {
		l.resizeHealth(v, v.Health*most/v.MaxHealth, most)
	}
	if o == nil {
		return
	}
	speed := max(stats.MovementSpeed, 0)
	if controls := l.controlsOn(v); !slices.Equal(controls, o.fight.controls) {
		o.fight.controls = controls
		o.send(encode(controlsMessage{"controls", append([]string{}, controls...)}))
		if c := o.fight.cast; c != nil && combat.Blocked(controls, c.ability) != "" {
			l.stopCast(&o.fight.unit)
		}
	}
	if combat.HoldsStill(o.fight.controls) {
		speed = 0
	}
	if o.motion.setSpeed(speed/100, now) {
		o.send(encode(speedMessage{"speed", speed}))
	}
}

// controlsOn is the controls a unit's statuses hold it with, sorted, each once, less those it's immune to.
func (l *Layer) controlsOn(v *unit) []string {
	var out []string
	now := l.hub.now()
	for _, held := range v.Statuses {
		for _, c := range held.def.Controls() {
			if !l.immuneTo(v, c, now) {
				out = append(out, c)
			}
		}
	}
	slices.Sort(out)
	return slices.Compact(out)
}

// immunities calls f with each `immune` effect a unit holds right now, until it says true, and
// says whether it did.
func (l *Layer) immunities(v *unit, now time.Time, f func(e *combat.StatusEffect) bool) bool {
	for _, held := range v.Statuses {
		for i := range held.def.Effects {
			if e := &held.def.Effects[i]; e.Type == "immune" && l.holds(v, e, nil, now) && f(e) {
				return true
			}
		}
	}
	return false
}

// immuneTo says whether a unit is immune to a kind of control.
func (l *Layer) immuneTo(v *unit, control string, now time.Time) bool {
	return l.immunities(v, now, func(e *combat.StatusEffect) bool { return e.All || slices.Contains(e.Controls, control) })
}

// immuneToDamage says whether a unit takes nothing from a hit of these schools.
func (l *Layer) immuneToDamage(v *unit, schools []string, now time.Time) bool {
	return l.immunities(v, now, func(e *combat.StatusEffect) bool {
		if e.All {
			return true
		}
		return slices.ContainsFunc(e.Schools, func(school string) bool { return slices.Contains(schools, school) })
	})
}

// immuneToStatus says whether a status from someone else bounces off a unit: it's harmful, or
// holds with a control it's immune to. You can always do it to yourself.
func (l *Layer) immuneToStatus(v *unit, s *combat.Status, from int64, now time.Time) bool {
	if v.ID == from {
		return false
	}
	if s.Kind == "debuff" && l.immunities(v, now, func(e *combat.StatusEffect) bool { return e.All || e.Harmful }) {
		return true
	}
	if slices.ContainsFunc(s.Controls(), func(c string) bool { return l.immuneTo(v, c, now) }) {
		return true
	}
	return s.Slows() && l.immuneTo(v, "slow", now)
}

// untargetable says whether nothing can pick a unit as a target right now.
func (l *Layer) untargetable(v *unit, now time.Time) bool {
	for _, held := range v.Statuses {
		for i := range held.def.Effects {
			e := &held.def.Effects[i]
			if e.Type != "untargetable" || !l.holds(v, e, nil, now) || now.Sub(held.since).Seconds() < e.AfterSeconds {
				continue
			}
			if e.OnlyBelow == 0 || (v.MaxHealth > 0 && v.Health/v.MaxHealth*100 < e.OnlyBelow) {
				return true
			}
		}
	}
	return false
}
