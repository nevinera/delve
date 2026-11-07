package game

import (
	"math"
	"slices"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

const recentDamageLasts = 60 * time.Second // how long a unit's damage taken is kept, for `recentDamage`

// taken is damage a unit took.
type taken struct {
	at time.Time
	n  float64
}

// amountFor is what an effect's amount comes to as it lands on someone, with what the fight has
// kept track of counted.
func (l *Layer) amountFor(u *unit, c *casting, e *combat.Effect, on *unit, count int, now time.Time) combat.Amount {
	out := amountOf(c, e, count)
	if e.Split && count > 1 {
		out = out.Grown(1 / float64(count))
	}
	if e.Others > 0 && c.target != 0 && on.ID != c.target {
		out = out.Grown(e.Others)
	}
	if e.PerCount != nil {
		n := l.counted(u, e.PerCount, on, now)
		if e.PerCount.Add != 0 {
			out.Min += e.PerCount.Add * n
			out.Max += e.PerCount.Add * n
		} else {
			out = out.Grown(n)
		}
	}
	return l.worked(u, c, out, on, now)
}

// worked adds a `shareOf` to an amount, and grows it by missing health.
func (l *Layer) worked(u *unit, c *casting, a combat.Amount, on *unit, now time.Time) combat.Amount {
	if a.ShareOf != nil {
		n := a.ShareOf.Share * l.shareBase(u, c, a.ShareOf, on, now)
		a.ShareOf = nil
		a.Min += n
		a.Max += n
	}
	if m := a.ByMissingHealth; m != nil {
		who := on
		switch m.Of {
		case "self":
			who = u
		case "target":
			if t := l.unit(c.target, u.char.Continent); t != nil {
				who = t
			}
		}
		a.ByMissingHealth = nil
		if who.MaxHealth > 0 {
			a = a.Grown(1 + (m.UpTo-1)*(1-who.Health/who.MaxHealth))
		}
	}
	return a
}

// shareBase is what a `shareOf` is a share of.
func (l *Layer) shareBase(u *unit, c *casting, s *combat.ShareOf, on *unit, now time.Time) float64 {
	switch s.Of {
	case "recentDamage":
		who := u
		if s.On == "target" {
			who = on
		}
		total := 0.0
		for _, each := range who.recent {
			if now.Sub(each.at).Seconds() <= s.Seconds {
				total += each.n
			}
		}
		return total
	case "stored":
		if c.status != nil {
			return c.status.stored
		}
	case "statusLeft":
		total := 0.0
		for key, held := range on.Statuses {
			if key.from != u.ID {
				continue
			}
			if len(s.Statuses) > 0 && !slices.Contains(s.Statuses, key.id) {
				continue
			}
			if len(s.Statuses) == 0 && c.status != held {
				continue
			}
			total += leftToDo(held, now)
		}
		return total
	case "effect":
		return c.lastDone
	case "casterMaxHealth":
		return u.MaxHealth
	case "unitMaxHealth":
		if u := l.unit(c.target, u.char.Continent); u != nil {
			return u.MaxHealth
		}
	case "maxResource":
		for _, r := range u.fight.class.Resources {
			if r.Key == s.Resource {
				return u.fight.pool(r).Max
			}
		}
	}
	return 0
}

// leftToDo is what a status's periodic effects have left to do, at their plain amounts.
func leftToDo(held *activeStatus, now time.Time) float64 {
	if held.until.IsZero() {
		return 0
	}
	total := 0.0
	for i := range held.def.Effects {
		e := &held.def.Effects[i]
		period := held.def.Period(e)
		if e.Type != "periodic" || period <= 0 {
			continue
		}
		next, ok := held.ticks[i]
		if !ok {
			next = held.since.Add(seconds(period))
		}
		if gap := next.Sub(now); gap <= held.until.Sub(now) {
			ticks := 1 + int((held.until.Sub(now)-gap).Seconds()/period)
			total += float64(ticks) * (e.Amount.Min + e.Amount.Max) / 2 * float64(held.stacks)
		}
	}
	return total
}

// counted is what a `perCount` comes to.
func (l *Layer) counted(u *unit, c *combat.PerCount, on *unit, now time.Time) float64 {
	weigh := func(id string) float64 {
		if n, ok := c.Weights[id]; ok {
			return n
		}
		return 1
	}
	n := 0.0
	switch {
	case c.StatusStacks != "":
		if held := on.Statuses[statusKey{c.StatusStacks, u.ID}]; held != nil {
			n = float64(held.stacks)
		}
	case c.StatusesFromMe:
		for key := range on.Statuses {
			if key.from == u.ID {
				n += weigh(key.id)
			}
		}
	case len(c.StatusesOnTarget) > 0:
		for _, id := range c.StatusesOnTarget {
			if on.Statuses[statusKey{id, u.ID}] != nil {
				n += weigh(id)
			}
		}
	case c.Resource != "":
		n = u.fight.resources[c.Resource]
	case c.Holders != "":
		for v := range l.units() {
			continent := v.char.Continent
			if continent == u.char.Continent && v.Statuses[statusKey{c.Holders, u.ID}] != nil {
				n++
			}
		}
	}
	if c.Max > 0 {
		n = min(n, c.Max)
	}
	return n
}

// critRules is what an effect says about crits, for the hit it's landing.
func (l *Layer) critRules(u *unit, e *combat.Effect, on *unit, ctx *combat.HitContext, now time.Time) {
	ctx.AlwaysCrit, ctx.ScalesWithCrit, ctx.CritMultiplier = e.AlwaysCrit, e.ScalesWithCrit, e.CritMultiplier
	if len(e.AlwaysCritWhen) > 0 {
		if _, ok := combat.All(e.AlwaysCritWhen, l.facts(u, on.ID, now)); ok {
			ctx.AlwaysCrit = true
		}
	}
}

// soak takes what a unit's absorbs catch out of a hit, and says what's left.
func (l *Layer) soak(on *unit, n float64, schools []string, h *hit, now time.Time) float64 {
	keys := make([]statusKey, 0, len(on.Statuses))
	for key, held := range on.Statuses {
		if held.absorb > 0 {
			keys = append(keys, key)
		}
	}
	// What ends soonest goes first, so less of it's wasted.
	slices.SortFunc(keys, func(a, b statusKey) int { return on.Statuses[a].since.Compare(on.Statuses[b].since) })
	for _, key := range keys {
		held := on.Statuses[key]
		if n <= 0 || held == nil || !absorbsFrom(held.def, schools) {
			continue
		}
		caught := min(n, held.absorb)
		held.absorb -= caught
		n -= caught
		h.Absorbed += math.Round(caught)
		if held.absorb <= 0 {
			l.takeOff(on, key)
		}
	}
	return n
}

func absorbsFrom(s *combat.Status, schools []string) bool {
	for i := range s.Effects {
		e := &s.Effects[i]
		if e.Type != "absorb" {
			continue
		}
		if len(e.Schools) == 0 && e.School == "" {
			return true
		}
		if slices.Contains(schools, e.School) || slices.ContainsFunc(e.Schools, func(school string) bool { return slices.Contains(schools, school) }) {
			return true
		}
	}
	return false
}

// startAbsorb sizes a status's absorb as it goes on: its own amount, or what applied it says.
func (l *Layer) startAbsorb(u *unit, held *activeStatus, given *combat.Amount, on *unit, now time.Time) {
	stats := l.statsOf(u, nil, now)
	has := false
	for i := range held.def.Effects {
		e := &held.def.Effects[i]
		if e.Type != "absorb" {
			continue
		}
		has = true
		amount := e.Amount
		if amount == (combat.Amount{}) && given != nil {
			amount = *given
		}
		n, _ := combat.Roll(amount.On(on.MaxHealth), stats, false, l.hub.roll)
		held.absorb += n
	}
	if !has && given != nil {
		n, _ := combat.Roll(given.On(on.MaxHealth), stats, false, l.hub.roll)
		held.stored = n
	}
}

// keepShare adds to what `store` effects hold, for what's just been done.
func (l *Layer) keepShare(doer *unit, doerID int64, on string, n float64, ctx *combat.HitContext) {
	for v := range l.units() {
		for key, held := range v.Statuses {
			for i := range held.def.Effects {
				e := &held.def.Effects[i]
				if e.Type != "store" || e.On != on {
					continue
				}
				if e.From == "holder" && v != doer {
					continue
				}
				if e.From != "holder" && key.from != doerID {
					continue
				}
				if !e.Applies(ctx, key.from) {
					continue
				}
				held.stored += e.Share * n
			}
		}
	}
}

// absorbOn is how much a unit's absorbs have left.
func absorbOn(v *unit) float64 {
	total := 0.0
	for _, held := range v.Statuses {
		total += held.absorb
	}
	return total
}

// spill lands a share of a hit on others near whoever it hit: a status's or an ability's `extraTargets`.
func (l *Layer) spill(u *unit, c *casting, e *combat.Effect, on *unit, center [3]float64, continent string, n float64, count int, now time.Time) {
	land := func(x *combat.ExtraTargets) bool {
		if x.Hit == "single" && count > 1 {
			return false
		}
		if _, ok := combat.All(x.When, l.facts(u, on.ID, now)); !ok {
			return false
		}
		others := []*unit{}
		for _, v := range l.inArea(areaOf{center: center, continent: continent, affects: "enemies", radius: x.Radius}) {
			if v != on && (x.Max == 0 || len(others) < x.Max) {
				others = append(others, v)
			}
		}
		if len(others) == 0 {
			return false
		}
		share := x.Share
		if x.SoftCap > 0 && len(others) > x.SoftCap {
			share *= float64(x.SoftCap) / float64(len(others))
		}
		for _, other := range others {
			h := hit{Type: "hit", From: u.ID, Ability: c.ability.ID, On: other.ID, Effect: "damage"}
			l.harm(u, other, l.soak(other, n*share, schoolsOf(e.School, e.Schools, c.ability), &h, now), &h, now)
			l.showHit(u.ID, other, h)
		}
		return true
	}
	if c.ability.ExtraTargets != nil {
		land(c.ability.ExtraTargets)
	}
	v := u
	for key, held := range v.Statuses {
		for i := range held.def.Effects {
			se := &held.def.Effects[i]
			if se.Type != "extraTargets" || se.Spill == nil || !land(se.Spill) || !se.SpendsStack {
				continue
			}
			if held.stacks--; held.stacks <= 0 {
				l.takeOff(v, key)
			} else {
				l.statusChanged(v.ID, key, held, now)
			}
		}
	}
}
