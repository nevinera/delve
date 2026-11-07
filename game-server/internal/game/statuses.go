package game

import (
	"bytes"
	"log"
	"math"
	"slices"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// Statuses on units: putting them on, ticking, breaking and taking them off, and the immunities and controls they give.

// applyStatus puts a status on a unit and notes it in the hit. It says whether the class has that status.
func (cm *Combat) applyStatus(u *unit, a *combat.Ability, id string, duration float64, on *unit, h *hit, now time.Time) bool {
	f := u.fight
	s := f.class.Status(id)
	if s == nil {
		log.Printf("character %d: ability %s applies a status its class hasn't got: %s", u.ID, a.ID, id)
		return false
	}
	mods := cm.modifiersOf(&f.unit, now)
	mastery := 0.0
	if len(mods) > 0 {
		mastery = cm.statsOf(&f.unit, nil, now).MasteryPercent()
	}
	s = f.class.ResolveStatus(s, duration, mods, mastery)
	if cm.immuneToStatus(on, s, u.ID, now) {
		h.Missed, h.Avoided = true, "immune"
		return true
	}
	lasts := s.Duration
	key := statusKey{s.ID, u.ID}
	was := on.Statuses[key]
	if s.Group != "" {
		for other, each := range on.Statuses {
			if other != key && each.def.Group == s.Group {
				cm.takeOff(on, other)
			}
		}
	}
	if s.Limit > 0 && was == nil {
		cm.makeRoom(u, s)
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
		held.ticks, held.fired, held.counts, held.effectAreas = was.ticks, was.fired, was.counts, was.effectAreas // putting it on again doesn't start these over
	}
	cm.state.addStatus(on, key, held, now)
	cm.fire(statusEvent("statusGained", on, key, held), now)
	h.Status, h.Lasts, h.Class, h.Stacks = s.ID, lasts, f.class.ID, held.stacks
	return true
}

// makeRoom takes a status off the oldest units holding it from a player, so one more stays within its limit.
func (cm *Combat) makeRoom(u *unit, s *combat.Status) {
	key := statusKey{s.ID, u.ID}
	var holders []*unit
	for v := range cm.state.units() {
		if v.Statuses[key] != nil {
			holders = append(holders, v)
		}
	}
	slices.SortFunc(holders, func(a, b *unit) int { return a.Statuses[key].since.Compare(b.Statuses[key].since) })
	for i := 0; i <= len(holders)-s.Limit; i++ {
		cm.takeOff(holders[i], key)
	}
}

// takeOff removes a status from a unit, says so, and fires what watches for it ending.
func (cm *Combat) takeOff(on *unit, key statusKey) {
	if held := cm.state.removeStatus(on, key); held != nil {
		cm.fire(statusEvent("statusEnds", on, key, held), cm.now())
	}
}

// dropFrom takes off everything a unit put on, when it leaves: nothing's left to carry it on or end it.
func (cm *Combat) dropFrom(from int64) {
	for v := range cm.state.units() {
		for key := range v.Statuses {
			if key.from == from {
				cm.takeOff(v, key)
			}
		}
	}
}

// breakStatuses takes off a unit's statuses that end when this happens. Only an ability has anything to keep them on.
func (cm *Combat) breakStatuses(on *unit, what string, kept func(*combat.Status) bool) {
	for key, each := range on.Statuses {
		if (slices.Contains(each.def.BreaksOn, what) || (what == "damage" && each.def.BreaksOnDamage())) && (kept == nil || !kept(each.def)) {
			cm.takeOff(on, key)
		}
	}
}

// sweep takes off statuses that have run out or whose holder has gone too far from who put them
// on, and refits each unit to what it holds now.
func (cm *Combat) sweep(now time.Time) {
	for v := range cm.state.units() {
		at := v.char.At
		continent := v.char.Continent
		for key, each := range v.Statuses {
			cm.tickStatus(v, key, each, at, continent, now)
			if v.Statuses[key] != each {
				continue
			}
			over := !each.until.IsZero() && !now.Before(each.until)
			if each.def.Leash > 0 && !over {
				from := cm.state.caster(key.from)
				over = from == nil || from.char.Continent != continent || distance(from.char.At, at) > each.def.Leash
			}
			if over {
				cm.takeOff(v, key)
			}
		}
		cm.refit(v, now)
	}
	cm.sweepEffectAreas(now)
}

// tickStatus lands whatever's due of a status's periodic effects. A last tick due as it ends still lands.
func (cm *Combat) tickStatus(v *unit, key statusKey, held *activeStatus, at [3]float64, continent string, now time.Time) {
	p := cm.state.caster(key.from)
	if p == nil {
		return
	}
	for i := range held.def.Effects {
		e := &held.def.Effects[i]
		if e.Type != "periodic" || held.def.Period(e) <= 0 {
			continue
		}
		period := cm.statsOf(p, nil, now).Hasted(held.def.Period(e))
		if held.ticks == nil {
			held.ticks = map[int]time.Time{}
		}
		next, ok := held.ticks[i]
		if !ok {
			next = held.since.Add(seconds(period))
		}
		for !now.Before(next) && (held.until.IsZero() || !next.After(held.until)) && v.Statuses[key] == held {
			cm.tickOf(p, v, key.id, held, e, at, continent, now)
			next = next.Add(seconds(period))
		}
		held.ticks[i] = next
	}
}

// tickOf lands one tick of a periodic effect, from the one who applied it. Ticks don't miss.
func (cm *Combat) tickOf(u *unit, holder *unit, id string, held *activeStatus, e *combat.StatusEffect, at [3]float64, continent string, now time.Time) {
	targets := []*unit{holder}
	if e.Affects == "enemies" || e.Affects == "allies" {
		targets = cm.around(e, at, continent)
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
			if cm.immuneToDamage(on, ctx.Schools, now) {
				continue
			}
			n, crit := cm.rollDamage(u, on, amount, ctx, now)
			h.Crit = crit
			cm.harm(u, on, cm.soak(on, n, ctx.Schools, &h, now), &h, now)
			cm.leech(u, on, n, ctx, "", now)
			cm.drain(u, n, e.Drain, "")
			defer cm.damaged(u, on, n, crit, ctx, now)
		case "heal":
			n, crit := cm.rollHeal(u, on, amount, ctx, now)
			h.Crit = crit
			over := max(on.Health+n-on.MaxHealth, 0)
			cm.state.setHealth(on, on.Health+n)
			h.Amount = math.Round(n)
			defer cm.healedBy(u, on, n, over, ctx, now)
		case "resource":
			o := cm.state.playerUnit(on)
			if o == nil {
				continue
			}
			n, _ := combat.Roll(amount, cm.statsOf(u, nil, now), false, cm.roll)
			given, ok := cm.addResource(o.fight, e.Resource, n)
			if !ok {
				continue
			}
			h.Amount, h.Resource = math.Round(given), e.Resource
		default:
			u.debugLine("%s: a periodic that does %s does nothing yet", id, e.Does)
			continue
		}
		u.debugLine("%s on %s ticks: %s %g", id, cm.nameOf(on.ID), e.Does, h.Amount)
		cm.state.showHit(on.ID, on, h)
	}
}

// around is who an area periodic reaches around its holder, nearest first.
func (cm *Combat) around(e *combat.StatusEffect, at [3]float64, continent string) []*unit {
	var found []reach
	for v := range cm.state.units() {
		isEnemy := v.dummy != nil // only dummies are enemies, for now
		if v.char.Continent != continent || isEnemy != (e.Affects == "enemies") {
			continue
		}
		if gap := distance(at, v.char.At); e.Radius <= 0 || gap <= e.Radius {
			found = append(found, reach{v, gap})
		}
	}
	return effectShape{most: e.Max}.ranked(found)
}

// statusChanged tells those near a unit how a status on it stands now.
func (cm *Combat) statusChanged(unit int64, key statusKey, held *activeStatus, now time.Time) {
	lasts := 0.0
	if !held.until.IsZero() {
		lasts = held.until.Sub(now).Seconds()
	}
	cm.state.tellOf(unit, encode(statusChanged{"statusChanged", unit, key.id, key.from, held.stacks, lasts}))
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
func (cm *Combat) refit(v *unit, now time.Time) {
	o := cm.state.playerUnit(v)
	if look := lookOn(v); !bytes.Equal(look, v.lookShown) {
		v.lookShown = look
		cm.state.tellOf(v.ID, encode(lookMessage{"look", v.ID, look}))
	}
	if left := math.Round(absorbOn(v)); left != v.absorbShown {
		v.absorbShown = left
		cm.state.tellOf(v.ID, encode(absorbMessage{"absorb", v.ID, left}))
	}
	if len(v.Statuses) == 0 && v.MaxHealth == v.base.MaxHealth && !v.untargetable && (o == nil || (cm.state.motionOf(o).settled() && len(o.fight.controls) == 0)) {
		return
	}
	if out := cm.untargetable(v, now); out != v.untargetable {
		v.untargetable = out
		cm.state.tellOf(v.ID, encode(targetable{"targetable", v.ID, !out}))
	}
	stats := cm.statsOf(v, nil, now)
	if most := max(stats.MaxHealth, 1); most != v.MaxHealth {
		cm.state.resizeHealth(v, v.Health*most/v.MaxHealth, most)
	}
	if o == nil {
		return
	}
	speed := max(stats.MovementSpeed, 0)
	if controls := cm.controlsOn(v); !slices.Equal(controls, o.fight.controls) {
		o.fight.controls = controls
		o.send(encode(controlsMessage{"controls", append([]string{}, controls...)}))
		if c := o.fight.cast; c != nil && combat.Blocked(controls, c.ability) != "" {
			cm.stopCast(v)
		}
	}
	if combat.HoldsStill(o.fight.controls) {
		speed = 0
	}
	if cm.state.motionOf(o).setSpeed(speed/100, now) {
		o.send(encode(speedMessage{"speed", speed}))
	}
}

// controlsOn is the controls a unit's statuses hold it with, sorted, each once, less those it's immune to.
func (cm *Combat) controlsOn(v *unit) []string {
	var out []string
	now := cm.now()
	for _, held := range v.Statuses {
		for _, c := range held.def.Controls() {
			if !cm.immuneTo(v, c, now) {
				out = append(out, c)
			}
		}
	}
	slices.Sort(out)
	return slices.Compact(out)
}

// immunities calls f with each `immune` effect a unit holds right now, until it says true, and
// says whether it did.
func (cm *Combat) immunities(v *unit, now time.Time, f func(e *combat.StatusEffect) bool) bool {
	for _, held := range v.Statuses {
		for i := range held.def.Effects {
			if e := &held.def.Effects[i]; e.Type == "immune" && cm.holds(v, e, nil, now) && f(e) {
				return true
			}
		}
	}
	return false
}

// immuneTo says whether a unit is immune to a kind of control.
func (cm *Combat) immuneTo(v *unit, control string, now time.Time) bool {
	return cm.immunities(v, now, func(e *combat.StatusEffect) bool { return e.All || slices.Contains(e.Controls, control) })
}

// immuneToDamage says whether a unit takes nothing from a hit of these schools.
func (cm *Combat) immuneToDamage(v *unit, schools []string, now time.Time) bool {
	return cm.immunities(v, now, func(e *combat.StatusEffect) bool {
		if e.All {
			return true
		}
		return slices.ContainsFunc(e.Schools, func(school string) bool { return slices.Contains(schools, school) })
	})
}

// immuneToStatus says whether a status from someone else bounces off a unit: it's harmful, or
// holds with a control it's immune to. You can always do it to yourself.
func (cm *Combat) immuneToStatus(v *unit, s *combat.Status, from int64, now time.Time) bool {
	if v.ID == from {
		return false
	}
	if s.Kind == "debuff" && cm.immunities(v, now, func(e *combat.StatusEffect) bool { return e.All || e.Harmful }) {
		return true
	}
	if slices.ContainsFunc(s.Controls(), func(c string) bool { return cm.immuneTo(v, c, now) }) {
		return true
	}
	return s.Slows() && cm.immuneTo(v, "slow", now)
}

// untargetable says whether nothing can pick a unit as a target right now.
func (cm *Combat) untargetable(v *unit, now time.Time) bool {
	for _, held := range v.Statuses {
		for i := range held.def.Effects {
			e := &held.def.Effects[i]
			if e.Type != "untargetable" || !cm.holds(v, e, nil, now) || now.Sub(held.since).Seconds() < e.AfterSeconds {
				continue
			}
			if e.OnlyBelow == 0 || (v.MaxHealth > 0 && v.Health/v.MaxHealth*100 < e.OnlyBelow) {
				return true
			}
		}
	}
	return false
}
