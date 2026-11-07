package game

import (
	"fmt"
	"math"
	"slices"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// Hits: avoiding, rolling damage and healing against stats and mods, leech and drain, and harm.

// debugLine logs a line for a player with combat debug on.
func (p *Player) debugLine(format string, args ...any) {
	if p.combatDebug {
		answer(p, "debug", fmt.Sprintf(format, args...))
	}
}

// debugHit says what an effect came to and how.
func (cm *Combat) debugHit(u *unit, ability string, e *combat.Effect, on *unit, h hit) string {
	line := fmt.Sprintf("%s on %s: %s", ability, cm.nameOf(on.ID), e.Type)
	if h.Missed {
		return line + " missed"
	}
	switch e.Type {
	case "damage", "heal", "resource":
		line += fmt.Sprintf(" %g from %s", h.Amount, combat.DescribeAmount(e.Amount, u.fight.stats))
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
func (cm *Combat) nameOf(id int64) string {
	if u := cm.state.unit(id, ""); u != nil {
		return u.char.Name
	}
	return "someone"
}

// strike rolls an attack on an enemy and does what it comes to, noting it in the hit.
func (cm *Combat) strike(u *unit, on *unit, amount combat.Amount, ctx combat.HitContext, h *hit, now time.Time) {
	blocked := false
	if on.ID != u.ID {
		u.fight.attacked(now)
		theirs := cm.statsOf(on, withOther(ctx, u.ID), now)
		melee, front := slices.Contains(ctx.Kinds, "melee"), cm.seesFromFront(on, u.char.At)
		if cm.avoided(on, u.ID, theirs, melee, front, &ctx, h, now) {
			return
		}
		blocked = combat.Blocks(theirs, melee, front, cm.roll)
	}
	if cm.immuneToDamage(on, ctx.Schools, now) {
		h.Missed, h.Avoided = true, "immune"
		return
	}
	n, crit := cm.rollDamage(u, on, amount, ctx, now)
	h.Crit = crit
	if blocked {
		n *= 1 - combat.BlockShare
		h.Blocked = true
	}
	cm.harm(u, on, cm.soak(on, n, ctx.Schools, h, now), h, now)
	if blocked {
		cm.fire(event{on: "block", who: on, other: u.ID, ctx: &ctx, amount: n}, now)
	}
	ability := ""
	if ctx.Ability != nil {
		ability = ctx.Ability.ID
	}
	cm.leech(u, on, n, ctx, ability, now)
	cm.damaged(u, on, n, crit, ctx, now)
}

// avoided rolls an attack on a unit, and says whether it came to nothing. A unit that dodges or
// parries is still in the fight.
func (cm *Combat) avoided(on *unit, from int64, theirs combat.Stats, melee, front bool, ctx *combat.HitContext, h *hit, now time.Time) bool {
	outcome := combat.AttackRoll(theirs, melee, front, cm.roll)
	if outcome == "" {
		return false
	}
	h.Missed = true
	if outcome == "miss" {
		return true
	}
	h.Avoided = outcome
	if o := cm.state.playerUnit(on); o != nil {
		o.fight.since["damageTaken"] = now
	}
	cm.fire(event{on: outcome, who: on, other: from, ctx: ctx}, now)
	return true
}

// statsOf is a unit's stats with what it holds counted. With a hit, stats narrowed to some hits
// count if they match it, and otherwise they don't.
func (cm *Combat) statsOf(v *unit, ctx *combat.HitContext, now time.Time) combat.Stats {
	return combat.Sheet(v.base, v.primary, cm.modsOf(v, ctx, now))
}

// modsOf is the stat effects that count for a unit right now.
func (cm *Combat) modsOf(v *unit, ctx *combat.HitContext, now time.Time) []combat.Mod {
	var mods []combat.Mod
	for key, held := range v.Statuses {
		for i := range held.def.Effects {
			e := &held.def.Effects[i]
			if e.Type != "stat" || !e.Applies(ctx, key.from) || !cm.holds(v, e, ctx, now) {
				continue
			}
			mod := combat.Mod{Effect: e, Stacks: held.stacks, Spent: held.spent}
			if o := cm.state.caster(key.from); o != nil {
				mod.Caster = &o.base
			}
			mods = append(mods, mod)
		}
	}
	return mods
}

// holds says whether a stat's own conditions hold for the unit holding it.
func (cm *Combat) holds(v *unit, e *combat.StatusEffect, ctx *combat.HitContext, now time.Time) bool {
	if len(e.When) == 0 {
		return true
	}
	facts := &combat.Facts{Self: unitOf(v, v.ID, nil), Since: map[string]float64{}, Resources: map[string]combat.ResourceAmount{}}
	if o := cm.state.playerUnit(v); o != nil {
		target := int64(0)
		if ctx != nil {
			target = ctx.Other
		}
		facts = cm.facts(v, target, now)
	}
	_, ok := combat.All(e.When, facts)
	return ok
}

// withOther is a hit as seen by one end of it, with `other` at the far end.
func withOther(ctx combat.HitContext, other int64) *combat.HitContext {
	ctx.Other = other
	return &ctx
}

// rollDamage is what a hit comes to, by the stats of who does it and who takes it.
func (cm *Combat) rollDamage(u *unit, on *unit, amount combat.Amount, ctx combat.HitContext, now time.Time) (float64, bool) {
	amount = amount.On(on.MaxHealth)
	mine, theirs := cm.statsOf(u, withOther(ctx, on.ID), now), cm.statsOf(on, withOther(ctx, u.ID), now)
	rolled := mine
	rolled.CritChance += theirs.CritTaken + ctx.CritChance
	rolled.CritDamage += ctx.CritDamage
	amount, rolled = combat.WithCritRules(amount, rolled, ctx)
	n, crit := combat.Roll(amount, rolled, true, cm.roll)
	before := n
	n = theirs.Taken(n*mine.DamageDone*(1+mine.Versatility()/100), ctx, mine.Level)
	if n != before {
		u.debugLine("damage %g comes to %g from stats", before, n)
	}
	return n, crit
}

// rollHeal is what a heal comes to, by the stats of who does it and who takes it.
func (cm *Combat) rollHeal(u *unit, on *unit, amount combat.Amount, ctx combat.HitContext, now time.Time) (float64, bool) {
	amount = amount.On(on.MaxHealth)
	mine, theirs := cm.statsOf(u, withOther(ctx, on.ID), now), cm.statsOf(on, withOther(ctx, u.ID), now)
	rolled := mine
	rolled.CritChance += ctx.CritChance
	rolled.CritDamage = mine.CritHealing + ctx.CritDamage
	amount, rolled = combat.WithCritRules(amount, rolled, ctx)
	n, crit := combat.Roll(amount, rolled, true, cm.roll)
	if times := mine.HealingDone * theirs.HealingTaken * (1 + mine.Versatility()/100); times != 1 {
		u.debugLine("healing %g x %g from stats", n, times)
		n *= times
	}
	return n, crit
}

// leech heals a player by its share of the damage it did to another.
func (cm *Combat) leech(u *unit, on *unit, n float64, ctx combat.HitContext, ability string, now time.Time) {
	if on.ID == u.ID {
		return
	}
	cm.drain(u, n, cm.statsOf(u, withOther(ctx, on.ID), now).Leech/100, ability)
}

// drain heals a player by a share of what it did.
func (cm *Combat) drain(u *unit, n, share float64, ability string) {
	f := u
	back := min(n*share, f.MaxHealth-f.Health)
	if back <= 0 {
		return
	}
	cm.state.setHealth(f, f.Health+back)
	cm.state.showHit(u.ID, f, hit{Type: "hit", From: u.ID, Ability: ability, On: u.ID, Effect: "heal", Amount: math.Round(back)})
}

// schoolsOf is the schools a hit counts as: its own, or else its ability's.
func schoolsOf(school string, schools []string, a *combat.Ability) []string {
	switch {
	case len(schools) > 0:
		return schools
	case school != "":
		return []string{school}
	case a != nil && len(a.Schools) > 0:
		return a.Schools
	case a != nil && a.School != "":
		return []string{a.School}
	}
	return nil
}

// hitOf describes an ability's effect landing on a unit, out of `count` it reached.
func hitOf(c *casting, e *combat.Effect, on *unit, count int) combat.HitContext {
	kinds := []string{"ability", "direct"}
	if c.ability.Range.Melee {
		kinds = append(kinds, "melee")
	}
	if e.Affects == "enemies" || e.Affects == "allies" {
		kinds = append(kinds, "effectArea")
	}
	if on.ID == c.target || e.Affects == "self" || e.Affects == "target" {
		kinds = append(kinds, "main")
	} else {
		kinds = append(kinds, "others")
	}
	if count == 1 {
		kinds = append(kinds, "single")
	}
	return combat.HitContext{Schools: schoolsOf(e.School, e.Schools, c.ability), Category: e.Category, Ability: c.ability, Kinds: kinds, Hits: count, CritChance: e.CritChance, CritDamage: e.CritDamage}
}

// harm takes health off a unit, noting it in the hit.
func (cm *Combat) harm(u *unit, on *unit, n float64, h *hit, now time.Time) {
	if n > 0 {
		on.recent = append(on.recent, taken{now, n})
		for len(on.recent) > 0 && now.Sub(on.recent[0].at) > recentDamageLasts {
			on.recent = on.recent[1:]
		}
	}
	if o := cm.state.playerUnit(on); o != nil {
		o.fight.since["damageTaken"] = now
	}
	cm.state.setHealth(on, on.Health-n)
	h.Amount = math.Round(n)
	cm.breakStatuses(on, "damage", nil)
	if d := on.mob; d != nil && d.training {
		d.tally(n, now)
		h.DPS = math.Round(d.dps(now))
		cm.state.setHealth(on, on.MaxHealth) // it's always at full health
	}
}
