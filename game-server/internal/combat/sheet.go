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
	// Mastery goes first, so that what scales by it can be any stat.
	isMastery := func(e *StatusEffect) *float64 {
		if e.Stat == "mastery" {
			return s.Others["mastery"]
		}
		return nil
	}
	change(mods, isMastery)
	shares(mods, isMastery, &s, primary)
	mastery := s.MasteryPercent()
	stage := func(gear bool) {
		pick := func(e *StatusEffect) *float64 {
			if isGear(e.Stat) != gear || e.Stat == "mastery" {
				return nil
			}
			return s.field(e.Stat)
		}
		change(mods, pick)
		scale(mods, pick, mastery)
		read := s
		shares(mods, pick, &read, primary)
	}
	stage(true)
	s.AttackPower += 2 * (max(s.Strength, s.Agility) - max(base.Strength, base.Agility))
	s.SpellPower += 2 * (s.Intellect - base.Intellect)
	s.MaxHealth += 10 * (s.Stamina - base.Stamina)
	stage(false)
	return s
}

// change makes a stat's `add`s, then its `multiply`s. `pick` says where a stat's kept, or nil to
// leave it be.
func change(mods []Mod, pick func(*StatusEffect) *float64) {
	for _, m := range mods {
		if field := pick(m.Effect); field != nil && m.Effect.Add != 0 {
			*field += m.Effect.Add * float64(m.Stacks)
		}
	}
	for _, m := range mods {
		if field := pick(m.Effect); field != nil && m.Effect.Multiply != nil {
			*field *= math.Pow(*m.Effect.Multiply, float64(m.Stacks))
		}
	}
}

// percentStats add a stat's `mastery` in points. The others grow by that percent.
var percentStats = []string{"critChance", "critDamage", "critHealing", "critTaken", "haste", "versatility", "leech", "avoidance", "dodge", "parry", "block", "movementSpeed", "attackSpeed"}

// scale makes the changes that go by the holder's mastery.
func scale(mods []Mod, pick func(*StatusEffect) *float64, mastery float64) {
	for _, m := range mods {
		field := pick(m.Effect)
		if field == nil || m.Effect.Mastery == 0 {
			continue
		}
		points := m.Effect.Mastery * mastery * float64(m.Stacks)
		if slices.Contains(percentStats, m.Effect.Stat) {
			*field += points
		} else {
			*field *= 1 + points/100
		}
	}
}

// shares adds what's worked out with `fromStat`, reading the holder's stats from `read`.
func shares(mods []Mod, pick func(*StatusEffect) *float64, read *Stats, primary []string) {
	for _, m := range mods {
		field := pick(m.Effect)
		if field == nil || m.Effect.FromStat == "" {
			continue
		}
		from := read
		if m.Effect.OfCaster {
			if m.Caster == nil {
				continue
			}
			from = m.Caster
		}
		*field += m.Effect.Share * from.named(m.Effect.FromStat, primary) * float64(m.Stacks)
	}
}

// Pool is how a resource behaves for someone right now.
type Pool struct {
	Max   float64
	Regen float64 // each second, in or out of combat
	Rest  float64 // where it drifts to out of combat
	Decay float64 // how fast it drifts there, each second
	Gain  float64 // a share of what abilities give
}

// PoolOf is a resource with the stats that name it counted. `s` is the holder's sheet.
func PoolOf(r Resource, s Stats, primary []string, mods []Mod) Pool {
	out := Pool{Max: MaxResource(r), Regen: RegenOf(r), Decay: DecayOf(r), Gain: 1}
	pick := func(e *StatusEffect) *float64 {
		if e.Resource != r.Key {
			return nil
		}
		switch e.Stat {
		case "resourceMax":
			return &out.Max
		case "resourceRegen":
			return &out.Regen
		case "resourceRest":
			return &out.Rest
		case "resourceDecay":
			return &out.Decay
		case "resourceGain":
			return &out.Gain
		}
		return nil
	}
	change(mods, pick)
	scale(mods, pick, s.MasteryPercent())
	shares(mods, pick, &s, primary)
	out.Max, out.Rest, out.Decay, out.Gain = max(out.Max, 0), max(out.Rest, 0), max(out.Decay, 0), max(out.Gain, 0)
	return out
}

// After is what `have` comes to after `dt` seconds. A rest with no decay drifts at 1 a second.
func (p Pool) After(have, dt float64, fighting bool) float64 {
	n := have + p.Regen*dt
	if !fighting {
		rate := p.Decay
		if rate == 0 && p.Rest > 0 {
			rate = 1
		}
		if n > p.Rest {
			n = max(p.Rest, n-rate*dt)
		} else {
			n = min(p.Rest, n+rate*dt)
		}
	}
	return max(0, min(p.Max, n))
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
