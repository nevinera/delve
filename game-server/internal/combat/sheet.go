package combat

import (
	"math"
	"slices"
)

// HitContext is what a narrowed stat asks about the hit it might change.
type HitContext struct {
	Schools  []string
	Category string
	Ability  *Ability // none for a swing or a status's own hit
	Status   string   // the status doing it, if one is
	Kinds    []string // what kinds of hit it counts as: auto, ability, melee and the rest
	Other    int64    // the unit at the other end of the hit
}

// narrowed says whether a stat only counts for some hits.
func (e *StatusEffect) narrowed() bool {
	return e.CasterOnly || e.School != "" || len(e.Schools) > 0 || e.Hit != "" || e.Category != "" || len(e.Categories) > 0 ||
		len(e.Abilities) > 0 || e.Tag != "" || len(e.Statuses) > 0
}

// Applies says whether a stat counts for a hit, or with no hit, whatever's going on. `from` put the status on.
func (e *StatusEffect) Applies(h *HitContext, from int64) bool {
	if e.Source == "summons" {
		return false // there are no summons yet
	}
	if !e.narrowed() {
		return true
	}
	if h == nil {
		return false
	}
	switch {
	case e.CasterOnly && h.Other != from:
		return false
	case e.School != "" && !slices.Contains(h.Schools, e.School):
		return false
	case len(e.Schools) > 0 && !slices.ContainsFunc(e.Schools, func(s string) bool { return slices.Contains(h.Schools, s) }):
		return false
	case e.Hit != "" && !slices.Contains(h.Kinds, e.Hit):
		return false
	case e.Category != "" && h.Category != e.Category:
		return false
	case len(e.Categories) > 0 && !slices.Contains(e.Categories, h.Category):
		return false
	case len(e.Statuses) > 0 && !slices.Contains(e.Statuses, h.Status):
		return false
	}
	if len(e.Abilities) > 0 || e.Tag != "" {
		if h.Ability == nil {
			return false
		}
		return slices.Contains(e.Abilities, h.Ability.ID) || (e.Tag != "" && slices.Contains(h.Ability.Tags, e.Tag))
	}
	return true
}

// Mod is a stat effect that counts right now, from a status held.
type Mod struct {
	Effect *StatusEffect
	Stacks int
	Caster *Stats // the stats of whoever applied the status, for `ofCaster`
}

// gearStats feed what's worked out from them, so statuses change them first.
var gearStats = []string{"strength", "agility", "intellect", "stamina", "armor", "critRating", "hasteRating", "masteryRating", "versatilityRating", "leechRating", "avoidanceRating", "speedRating"}

// field is where a stat's kept. Resource stats aren't kept here.
func (s *Stats) field(name string) *float64 {
	switch name {
	case "strength":
		return &s.Strength
	case "agility":
		return &s.Agility
	case "intellect":
		return &s.Intellect
	case "stamina":
		return &s.Stamina
	case "attackPower":
		return &s.AttackPower
	case "spellPower":
		return &s.SpellPower
	case "maxHealth":
		return &s.MaxHealth
	case "critChance":
		return &s.CritChance
	case "critDamage":
		return &s.CritDamage
	case "critHealing":
		return &s.CritHealing
	case "critTaken":
		return &s.CritTaken
	case "leech":
		return &s.Leech
	case "movementSpeed":
		return &s.MovementSpeed
	case "attackSpeed":
		return &s.AttackSpeed
	case "damageDone":
		return &s.DamageDone
	case "healingDone":
		return &s.HealingDone
	case "damageTaken":
		return &s.DamageTaken
	case "healingTaken":
		return &s.HealingTaken
	}
	if s.Others == nil {
		return nil
	}
	if p, ok := s.Others[name]; ok {
		return p
	}
	return nil
}

// otherStats are kept and changed, but nothing reads them yet.
var otherStats = []string{"armor", "critRating", "hasteRating", "masteryRating", "versatilityRating", "leechRating", "avoidanceRating", "speedRating", "haste", "mastery", "versatility", "avoidance", "dodge", "parry", "block", "stealth", "detection", "threat"}

// Sheet is a unit's stats with what it holds counted: gear stats first, then what's worked out
// from them, then changes to those. A stat's `add`s go before its `multiply`s, and `fromStat`
// comes last. Stacks scale them all.
func Sheet(base Stats, primary []string, mods []Mod) Stats {
	s := base
	s.Others = map[string]*float64{}
	for _, name := range otherStats {
		v := 0.0
		if name == "threat" {
			v = 1
		}
		s.Others[name] = &v
	}
	isGear := func(name string) bool { return slices.Contains(gearStats, name) }
	stage := func(gear bool) {
		for _, m := range mods {
			if field := s.field(m.Effect.Stat); field != nil && isGear(m.Effect.Stat) == gear && m.Effect.Add != 0 {
				*field += m.Effect.Add * float64(m.Stacks)
			}
		}
		for _, m := range mods {
			if field := s.field(m.Effect.Stat); field != nil && isGear(m.Effect.Stat) == gear && m.Effect.Multiply != nil {
				*field *= math.Pow(*m.Effect.Multiply, float64(m.Stacks))
			}
		}
		read := s
		for _, m := range mods {
			field := s.field(m.Effect.Stat)
			if field == nil || isGear(m.Effect.Stat) != gear || m.Effect.FromStat == "" {
				continue
			}
			from := &read
			if m.Effect.OfCaster {
				if m.Caster == nil {
					continue
				}
				from = m.Caster
			}
			*field += m.Effect.Share * from.named(m.Effect.FromStat, primary) * float64(m.Stacks)
		}
	}
	stage(true)
	s.AttackPower += 2 * (max(s.Strength, s.Agility) - max(base.Strength, base.Agility))
	s.SpellPower += 2 * (s.Intellect - base.Intellect)
	s.MaxHealth += 10 * (s.Stamina - base.Stamina)
	stage(false)
	return s
}

// named reads a stat by name. `primary` is the highest of the holder's main stats.
func (s *Stats) named(name string, primary []string) float64 {
	if name == "primary" {
		most := 0.0
		for _, each := range primary {
			if p := s.field(each); p != nil {
				most = max(most, *p)
			}
		}
		return most
	}
	if p := s.field(name); p != nil {
		return *p
	}
	return 0
}
