package game

import (
	"cmp"
	"slices"
	"strings"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// firingDepth is how many triggers can set each other off in a row, so two can't go on for ever.
const firingDepth = 4

// event is something a `trigger` can watch for.
type event struct {
	on       string
	who      *unit              // whose event it is
	other    int64              // the unit at the other end of it
	ctx      *combat.HitContext // the hit or ability it's about, if any
	amount   float64            // what it did, or spent
	status   string             // the status it's about, if any
	stacks   int                // how many stacks that has
	resource string             // what it spent
	below    float64            // for health: the share it fell from, in percent
	above    float64            // and the share it fell to

	ending    *activeStatus // a status this is the end of, whose own triggers still count
	endingKey statusKey
	endingOn  *unit
}

// watcher is one trigger that might fire.
type watcher struct {
	on    *unit
	key   statusKey
	held  *activeStatus
	place int // the effect's place in the status
	e     *combat.StatusEffect
}

// watchers is every trigger that's watching whoever an event belongs to.
func (cm *Combat) watchers(ev event) []watcher {
	var out []watcher
	look := func(v *unit, key statusKey, held *activeStatus) {
		for i := range held.def.Effects {
			e := &held.def.Effects[i]
			if e.Type != "trigger" || e.Effect == nil || (e.On != ev.on && e.ResetOn != ev.on) {
				continue
			}
			mine := v == ev.who
			if ev.on == "allyHealthBelow" {
				mine = v != ev.who && v.ID > 0
			}
			if e.Of == "caster" {
				mine = key.from == ev.who.ID
			}
			if mine {
				out = append(out, watcher{v, key, held, i, e})
			}
		}
	}
	for v := range cm.state.units() {
		for key, held := range v.Statuses {
			look(v, key, held)
		}
	}
	if ev.ending != nil && ev.endingOn.Statuses[ev.endingKey] != ev.ending {
		look(ev.endingOn, ev.endingKey, ev.ending)
	}
	slices.SortFunc(out, func(a, b watcher) int {
		if n := strings.Compare(a.key.id, b.key.id); n != 0 {
			return n
		}
		if n := cmp.Compare(a.on.ID, b.on.ID); n != 0 {
			return n
		}
		return cmp.Compare(a.place, b.place)
	})
	return out
}

// fire sets off the triggers watching for an event.
func (cm *Combat) fire(ev event, now time.Time) {
	if cm.firing >= firingDepth {
		return
	}
	cm.firing++
	defer func() { cm.firing-- }()
	for _, w := range cm.watchers(ev) {
		if w.e.ResetOn == ev.on {
			delete(w.held.counts, w.place)
		}
		if w.e.On == ev.on && cm.triggerMatches(w, ev, now) && cm.triggerDue(w, ev, now) {
			cm.runTrigger(w, ev, now)
		}
	}
}

// triggerMatches checks a trigger's filters.
func (cm *Combat) triggerMatches(w watcher, ev event, now time.Time) bool {
	e := w.e
	ctx := combat.HitContext{Status: ev.status}
	if ev.ctx != nil {
		ctx = *ev.ctx
	}
	ctx.Other = ev.other
	isStatusEvent := slices.Contains([]string{"statusGained", "statusConsumed", "statusEnds", "dispelled", "holderDies"}, ev.on)
	switch {
	case isStatusEvent && ev.status != "" && !slices.Contains(append(slices.Clone(e.Statuses), statusesOrOwn(e, w.held)...), ev.status):
		return false
	case !isStatusEvent && !e.Applies(&ctx, w.key.from):
		return false
	case e.NotOnHolder && ev.other == w.on.ID:
		return false
	case e.Resource != "" && e.Resource != ev.resource:
		return false
	case e.AtStacks > 0 && ev.stacks < e.AtStacks:
		return false
	case e.AtMax && (w.held.def.MaxStacks <= 0 || ev.stacks < w.held.def.MaxStacks):
		return false
	case e.AtTargets > 0 && ctx.Hits < e.AtTargets:
		return false
	case e.Threshold > 0 && (ev.below < e.Threshold || ev.above >= e.Threshold):
		return false
	}
	return cm.holds(w.on, e, &ctx, now)
}

// statusesOrOwn is the statuses a trigger on a status's life watches: those it names, or its own.
func statusesOrOwn(e *combat.StatusEffect, held *activeStatus) []string {
	if len(e.Statuses) > 0 {
		return nil
	}
	return []string{held.def.ID}
}

// triggerDue checks what limits how often a trigger fires, and keeps its count.
func (cm *Combat) triggerDue(w watcher, ev event, now time.Time) bool {
	e := w.e
	if at, ok := w.held.fired[w.place]; ok && e.Cooldown > 0 && now.Before(at.Add(seconds(e.Cooldown))) {
		return false
	}
	if e.Every > 0 {
		if w.held.counts == nil {
			w.held.counts = map[int]float64{}
		}
		by := 1.0
		if ev.on == "spend" {
			by = ev.amount
		}
		w.held.counts[w.place] += by
		if w.held.counts[w.place] < e.Every {
			return false
		}
		w.held.counts[w.place] -= e.Every
	}
	chance := e.Chance
	if chance == 0 {
		chance = 1
	}
	if e.Mastery != 0 {
		chance += e.Mastery * cm.statsOf(w.on, nil, now).MasteryPercent() / 100
	}
	if chance < 1 && cm.roll() >= chance {
		return false
	}
	if w.held.fired == nil {
		w.held.fired = map[int]time.Time{}
	}
	w.held.fired[w.place] = now
	return true
}

// runTrigger does what a trigger does. Whoever applied the status does it.
func (cm *Combat) runTrigger(w watcher, ev event, now time.Time) {
	caster := cm.state.caster(w.key.from)
	if caster == nil {
		return
	}
	effect := *w.e.Effect
	effect.Amount.Min += effect.Amount.ShareOfTrigger * ev.amount
	effect.Amount.Max += effect.Amount.ShareOfTrigger * ev.amount
	effect.Amount.ShareOfTrigger = 0
	c := &casting{ability: &combat.Ability{ID: w.held.def.ID, Name: w.held.def.Name}, target: ev.other, status: w.held}
	var targets []*unit
	switch effect.Affects {
	case "", "self", "holder":
		targets = []*unit{w.on}
	case "caster":
		targets = []*unit{caster}
	case "target":
		if on := cm.state.unit(ev.other, caster.char.Continent); on != nil {
			targets = []*unit{on}
		}
	default:
		targets = cm.reached(caster, c, &effect)
	}
	for _, on := range targets {
		if _, ok := combat.All(effect.When, cm.facts(caster, on.ID, now)); !ok {
			continue
		}
		runner := caster
		if cm.state.present(on) && effect.Type == "resource" {
			runner = on // what it gives goes to the one it lands on
		}
		caster.debugLine("%s fires on %s", w.held.def.Name, ev.on)
		cm.land(runner, c, &effect, on, len(targets), now)
	}
	if w.on.Statuses[w.key] != w.held {
		return
	}
	switch {
	case w.e.Resets:
		cm.takeOff(w.on, w.key)
	case w.e.SpendsStack:
		w.held.stacks--
		if w.held.stacks <= 0 {
			cm.takeOff(w.on, w.key)
		} else {
			cm.statusChanged(w.on.ID, w.key, w.held, now)
		}
	}
}

// damaged says a player did damage, for what's watching. `n` has already come off.
func (cm *Combat) damaged(u *unit, on *unit, n float64, crit bool, ctx combat.HitContext, now time.Time) {
	mine := u
	cm.keepShare(mine, u.ID, "dealDamage", n, &ctx)
	outcome := "nonCrit"
	if crit {
		outcome = "crit"
	}
	cm.fire(event{on: "dealDamage", who: mine, other: on.ID, ctx: &ctx, amount: n}, now)
	cm.fire(event{on: outcome, who: mine, other: on.ID, ctx: &ctx, amount: n}, now)
	cm.fire(event{on: "takeDamage", who: on, other: u.ID, ctx: &ctx, amount: n}, now)
	if on.MaxHealth > 0 {
		before, after := 100*min(on.Health+n, on.MaxHealth)/on.MaxHealth, 100*on.Health/on.MaxHealth
		cm.fire(event{on: "healthBelow", who: on, other: u.ID, ctx: &ctx, amount: n, below: before, above: after}, now)
		if on.ID > 0 {
			cm.fire(event{on: "allyHealthBelow", who: on, other: on.ID, ctx: &ctx, amount: n, below: before, above: after}, now)
		}
	}
}

// healedBy says a player healed a unit, for what's watching. `over` is the part past full health.
func (cm *Combat) healedBy(u *unit, on *unit, n, over float64, ctx combat.HitContext, now time.Time) {
	cm.keepShare(u, u.ID, "heal", n, &ctx)
	cm.fire(event{on: "heal", who: u, other: on.ID, ctx: &ctx, amount: n}, now)
	cm.fire(event{on: "healed", who: on, other: u.ID, ctx: &ctx, amount: n}, now)
	if over > 0 {
		cm.fire(event{on: "overheal", who: u, other: on.ID, ctx: &ctx, amount: over}, now)
	}
}

// statusEvent is something happening in a status's life.
func statusEvent(on string, holder *unit, key statusKey, held *activeStatus) event {
	return event{on: on, who: holder, other: key.from, status: key.id, stacks: held.stacks, ending: held, endingKey: key, endingOn: holder}
}
