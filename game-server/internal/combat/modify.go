package combat

import (
	"encoding/json"
	"log"
	"math"
	"reflect"
	"slices"
	"strings"
)

// How a `modify` changes a number, in the order they go.
const (
	setting = iota
	adding
	multiplying
)

// edit is one `modify` changing whatever it picks, by one of those.
type edit struct {
	how int
	n   float64
	add *Amount // `addAmount`, which goes with `add`s
}

func (d edit) number(p *float64) {
	switch d.how {
	case setting:
		*p = d.n
	case adding:
		*p += d.n
	case multiplying:
		*p *= d.n
	}
}

func (d edit) whole(p *int) {
	n := float64(*p)
	d.number(&n)
	*p = int(math.Round(n))
}

func (d edit) amount(a *Amount) {
	switch d.how {
	case setting:
		*a = Amount{Min: d.n, Max: d.n}
	case adding:
		a.Min += d.n
		a.Max += d.n
		if d.add != nil {
			a.Min += d.add.Min
			a.Max += d.add.Max
			a.AttackPower += d.add.AttackPower
			a.SpellPower += d.add.SpellPower
			a.Weapon += d.add.Weapon
			a.Mast += d.add.Mast
			a.MaxHealth += d.add.MaxHealth
		}
	case multiplying:
		a.scale(d.n)
	}
}

func (a *Amount) scale(by float64) {
	a.Min *= by
	a.Max *= by
	a.AttackPower *= by
	a.SpellPower *= by
	a.Weapon *= by
	a.Mast *= by
	a.MaxHealth *= by
	if a.PerSpent != nil {
		per := *a.PerSpent
		per.scale(by)
		a.PerSpent = &per
	}
}

// Grown is an amount made this many times bigger.
func (a Amount) Grown(by float64) Amount {
	a.scale(by)
	return a
}

// edits is what a `modify` does at each stage, if anything. `Mastery` grows what it picks as a
// `multiply` does, and stacks scale them all.
func edits(m Mod, mastery float64, how int) (edit, bool) {
	e, stacks := m.Effect, float64(m.Stacks)
	switch how {
	case setting:
		if e.Set != nil {
			return edit{how: how, n: *e.Set}, true
		}
	case adding:
		if e.Add != 0 || e.AddAmount != nil {
			return edit{how: how, n: e.Add * stacks, add: e.AddAmount}, true
		}
	case multiplying:
		n := 1.0
		if e.Multiply != nil {
			n = math.Pow(*e.Multiply, stacks)
		}
		n *= 1 + e.Mastery*mastery*stacks/100
		if n != 1 {
			return edit{how: how, n: n}, true
		}
	}
	return edit{}, false
}

// picks says whether a `modify` is about this ability.
func (e *StatusEffect) picks(a *Ability) bool {
	if e.Type != "modify" || e.Source == "summons" || len(e.Statuses) > 0 {
		return false
	}
	schools := a.Schools
	if len(schools) == 0 && a.School != "" {
		schools = []string{a.School}
	}
	switch {
	case e.School != "" && !slices.Contains(schools, e.School):
		return false
	case len(e.Schools) > 0 && !slices.ContainsFunc(e.Schools, func(s string) bool { return slices.Contains(schools, s) }):
		return false
	case len(e.Abilities) == 0 && e.Tag == "":
		return true
	}
	return slices.Contains(e.Abilities, a.ID) || (e.Tag != "" && slices.Contains(a.Tags, e.Tag))
}

// byHits says whether a `modify` waits to see how many the ability hits.
func (e *StatusEffect) byHits() bool {
	return (e.AtTargets > 0 || e.PerTargetHit != 0) && slices.Contains([]string{"amount", "damage", "healing"}, e.Change)
}

// Resolve is an ability with what its user holds counted. It gives back the same ability if
// nothing changes it. `roll` gives numbers in [0, 1), for a `modify` with a `chance`.
func (c *Class) Resolve(a *Ability, mods []Mod, mastery float64, roll func() float64) *Ability {
	var picked []Mod
	out := *a
	copied := false
	own := func() {
		if copied {
			return
		}
		copied = true
		out.Tags = slices.Clone(a.Tags)
		out.Cost = slices.Clone(a.Cost)
		out.Effects = slices.Clone(a.Effects)
		if a.Channel != nil {
			channel := *a.Channel
			out.Channel = &channel
		}
	}
	// Tags come first, as what they add can bring other changes in.
	for _, m := range mods {
		if len(m.Effect.AddTags) > 0 && m.Effect.picks(&out) {
			own()
			out.Tags = append(out.Tags, m.Effect.AddTags...)
		}
	}
	for _, m := range mods {
		e := m.Effect
		if !e.picks(&out) || (e.Change == "" && len(e.AddEffects) == 0 && len(e.Overrides) == 0 && len(e.Ignores) == 0 && e.SpentAs == 0 && !e.SpentAsMax && e.SpendsUpTo == 0 && e.ByExtraSpent == 0) {
			continue
		}
		if e.Chance > 0 && roll() >= e.Chance {
			continue
		}
		picked = append(picked, m)
	}
	if len(picked) == 0 && !copied {
		return a
	}
	own()
	// What changes the ability's shape comes before its numbers, so they cover what's added.
	for _, m := range picked {
		override(&out, m.Effect.Overrides)
		out.Effects = append(out.Effects, m.Effect.AddEffects...)
		out.Ignores = append(out.Ignores, m.Effect.Ignores...)
		if m.Effect.SpentAs != 0 {
			out.SpentAs = m.Effect.SpentAs
		}
		out.SpentAsMax = out.SpentAsMax || m.Effect.SpentAsMax
		out.SpendsUpTo += m.Effect.SpendsUpTo
		if m.Effect.ByExtraSpent != 0 {
			out.ByExtraSpent = m.Effect.ByExtraSpent
		}
	}
	for i := range out.Effects {
		if e := &out.Effects[i]; e.Type == "status" && e.Duration == 0 {
			if s := c.Status(e.Status); s != nil {
				e.Duration = s.Duration
			}
		}
	}
	for _, how := range []int{setting, adding, multiplying} {
		for _, m := range picked {
			if d, ok := edits(m, mastery, how); ok && m.Effect.Change != "" && !m.Effect.byHits() {
				out.change(m.Effect.Change, m.Effect.Resource, d)
			}
		}
	}
	for _, m := range picked {
		if m.Effect.byHits() {
			for i := range out.Effects {
				if e := &out.Effects[i]; e.isChangedBy(m.Effect.Change) {
					e.ByHits = append(e.ByHits, m)
				}
			}
		}
	}
	out.Cooldown, out.CastTime, out.Range.Feet = max(out.Cooldown, 0), max(out.CastTime, 0), max(out.Range.Feet, 0)
	for i := range out.Cost {
		out.Cost[i].Amount, out.Cost[i].Percent = max(out.Cost[i].Amount, 0), max(out.Cost[i].Percent, 0)
	}
	for i := range out.Effects {
		e := &out.Effects[i]
		e.Radius, e.Cone, e.Duration = max(e.Radius, 0), max(e.Cone, 0), max(e.Duration, 0)
	}
	return &out
}

// isChangedBy says whether a `change` of amounts covers this effect.
func (e *Effect) isChangedBy(change string) bool {
	switch change {
	case "amount":
		return e.Type == "damage" || e.Type == "heal" || e.Type == "resource" || e.Type == "absorb"
	case "damage":
		return e.Type == "damage"
	case "healing":
		return e.Type == "heal"
	case "absorb":
		return e.Type == "absorb"
	case "resourceGain":
		return e.Type == "resource"
	}
	return false
}

// change makes one change to the numbers of an ability. A name it doesn't have is an effect's `param`.
func (a *Ability) change(name, resource string, d edit) {
	switch name {
	case "cost":
		found := false
		for i := range a.Cost {
			if cost := &a.Cost[i]; resource == "" || cost.Resource == resource {
				found = true
				if cost.Percent > 0 {
					d.number(&cost.Percent)
				} else {
					d.number(&cost.Amount)
				}
			}
		}
		if !found && resource != "" && d.how == setting {
			a.Cost = append(a.Cost, Cost{Resource: resource, Amount: d.n})
		}
		return
	case "cooldown":
		d.number(&a.Cooldown)
		return
	case "castTime":
		d.number(&a.CastTime)
		return
	case "charges":
		a.Charges = max(a.Charges, 1)
		d.whole(&a.Charges)
		return
	case "range":
		d.number(&a.Range.Feet)
		if d.how == setting {
			a.Range.Melee = false
		}
		return
	case "channelDuration", "channelTicks":
		if a.Channel != nil && name == "channelDuration" {
			d.number(&a.Channel.Duration)
		} else if a.Channel != nil {
			d.whole(&a.Channel.Ticks)
		}
		return
	}
	for i := range a.Effects {
		e := &a.Effects[i]
		switch name {
		case "amount", "damage", "healing", "absorb", "resourceGain":
			if e.isChangedBy(name) {
				d.amount(&e.Amount)
			}
		case "cone":
			d.number(&e.Cone)
		case "radius":
			d.number(&e.Radius)
		case "maxTargets":
			if e.Max > 0 {
				d.whole(&e.Max)
			}
		case "duration":
			if e.Type == "status" {
				d.number(&e.Duration)
			}
		case "critChance":
			d.number(&e.CritChance)
		case "critDamage":
			d.number(&e.CritDamage)
		default:
			if e.Param == name {
				d.amount(&e.Amount)
			}
		}
	}
}

// AmountFor is an effect's amount when its ability hit `count` units.
func (e *Effect) AmountFor(count int) Amount {
	out := Shared(e.Amount, e.SoftCap, count)
	for _, m := range e.ByHits {
		if count < m.Effect.AtTargets {
			continue
		}
		if m.Effect.AtTargets > 0 {
			for _, how := range []int{setting, adding, multiplying} {
				if d, ok := edits(m, m.Mastery, how); ok {
					d.amount(&out)
				}
			}
		}
		if m.Effect.PerTargetHit != 0 {
			more := m.Effect.PerTargetHit * float64(count)
			if m.Effect.MaxTotal > 0 {
				more = min(more, m.Effect.MaxTotal)
			}
			out.scale(1 + more)
		}
	}
	return out
}

// ResolveStatus is a status with what the one applying it holds counted. `duration` takes the
// place of the status's own, if it's given. It gives back the same status if nothing changes it.
func (c *Class) ResolveStatus(s *Status, duration float64, mods []Mod, mastery float64) *Status {
	out := *s
	if duration > 0 {
		out.Duration = duration
	}
	var picked []Mod
	for _, m := range mods {
		if m.Effect.Type == "modify" && slices.Contains(m.Effect.Statuses, s.ID) {
			picked = append(picked, m)
		}
	}
	if len(picked) == 0 {
		return &out
	}
	out.Effects = slices.Clone(s.Effects)
	lasts := out.Duration
	for _, m := range picked {
		override(&out, m.Effect.Overrides)
		out.Effects = append(out.Effects, m.Effect.StatusEffects...)
	}
	if duration > 0 {
		out.Duration = duration
	} else if out.Duration == 0 {
		out.Duration = lasts
	}
	for _, how := range []int{setting, adding, multiplying} {
		for _, m := range picked {
			d, ok := edits(m, mastery, how)
			if !ok || m.Effect.Change == "" {
				continue
			}
			switch m.Effect.Change {
			case "duration":
				d.number(&out.Duration)
			case "maxStacks":
				d.whole(&out.MaxStacks)
			case "tickRate":
				out.TickRate = max(out.TickRate, 0)
				if out.TickRate == 0 {
					out.TickRate = 1
				}
				d.number(&out.TickRate)
			default:
				for i := range out.Effects {
					if e := &out.Effects[i]; e.Param == m.Effect.Change {
						e.changeParam(d)
					}
				}
			}
		}
	}
	out.Duration = max(out.Duration, 0)
	return &out
}

// override replaces those keys of a definition. `null` removes one, and a key it hasn't got means
// nothing: the game doesn't read that key yet.
func override(into any, keys map[string]json.RawMessage) {
	if len(keys) == 0 {
		return
	}
	v := reflect.ValueOf(into).Elem()
	for i := 0; i < v.NumField(); i++ {
		name, _, _ := strings.Cut(v.Type().Field(i).Tag.Get("json"), ",")
		text, named := keys[name]
		if !named {
			continue
		}
		field := v.Field(i)
		field.SetZero()
		if err := json.Unmarshal(text, field.Addr().Interface()); err != nil {
			log.Printf("combat: bad override of %s: %v", name, err)
		}
	}
}

// changeParam changes the number a status effect's `param` names.
func (e *StatusEffect) changeParam(d edit) {
	switch {
	case e.Type == "periodic":
		d.amount(&e.Amount)
	case e.FromStat != "":
		d.number(&e.Share)
	case e.Multiply != nil:
		n := *e.Multiply
		d.number(&n)
		e.Multiply = &n
	default:
		d.number(&e.Add)
	}
}
