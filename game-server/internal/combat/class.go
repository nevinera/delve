// Package combat holds what the game server knows of classes and abilities: reading them from a
// world's files, working out a character's stats, and rolling what an effect does. It knows nothing
// of connections or layers.
package combat

import (
	"encoding/json"
	"fmt"
	"slices"
)

// Class is the part of classes/<id>.json the game plays.
type Class struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	PrimaryStats []string   `json:"primaryStats"`
	Resources    []Resource `json:"resources"`
	Abilities    []Ability  `json:"abilities"`
	Statuses     []Status   `json:"statuses"`
	// What a character chooses gives these abilities, so level alone doesn't.
	Specializations []Specialization    `json:"specializations"`
	Talents         map[string][]Talent `json:"talents"`
}

// Specialization is what a character picks at the level the game sets.
type Specialization struct {
	ID        string   `json:"id"`
	Abilities []string `json:"abilities"`
}

// Talent is one choice in a talent tier.
type Talent struct {
	Grants []struct {
		Ability string `json:"ability"`
	} `json:"grants"`
}

// Resource is one of a class's resources. Kind is mana, energy, rage or points.
type Resource struct {
	Key   string  `json:"key"`
	Kind  string  `json:"kind"`
	Max   int     `json:"max"`
	Regen float64 `json:"regen"`
	Decay float64 `json:"decay"`
}

// Ability is what the game needs of an ability.
type Ability struct {
	ID              string      `json:"id"`
	Name            string      `json:"name"`
	Level           int         `json:"level"`
	School          string      `json:"school"`
	Schools         []string    `json:"schools"`
	Target          string      `json:"target"` // enemy, ally, self, ground or none
	Range           Distance    `json:"range"`
	MinRange        float64     `json:"minRange"`
	Facing          *bool       `json:"facing"`
	CastTime        float64     `json:"castTime"`
	CastWhileMoving bool        `json:"castWhileMoving"`
	Channel         *Channel    `json:"channel"`
	GCD             *float64    `json:"gcd"`
	Cooldown        float64     `json:"cooldown"`
	Charges         int         `json:"charges"`
	Cost            []Cost      `json:"cost"`
	Speed           float64     `json:"speed"`
	Effects         []Effect    `json:"effects"`
	Requires        []Condition `json:"requires"`
	Tags            []string    `json:"tags"`
}

// Channel is an ability that goes on for Duration seconds, landing its effects Ticks times.
type Channel struct {
	Duration float64 `json:"duration"`
	Ticks    int     `json:"ticks"`
}

// Cost is what using an ability spends.
type Cost struct {
	Resource string  `json:"resource"`
	Amount   float64 `json:"amount"`
	Percent  float64 `json:"percent"` // of the resource's most
}

// Effect is one thing an ability does.
type Effect struct {
	Type     string      `json:"type"`
	Affects  string      `json:"affects"` // target, self, enemies or allies
	Around   string      `json:"around"`  // self, target or ground
	Radius   float64     `json:"radius"`
	Cone     float64     `json:"cone"`
	Max      int         `json:"max"`
	Amount   Amount      `json:"amount"`
	School   string      `json:"school"`
	Schools  []string    `json:"schools"`
	Category string      `json:"category"`
	Resource string      `json:"resource"`
	Status   string      `json:"status"`
	Duration float64     `json:"duration"`
	When     []Condition `json:"when"`

	// consume and extend
	Statuses  []string `json:"statuses"`
	Stacks    int      `json:"stacks"`
	Seconds   float64  `json:"seconds"`
	DealsLeft float64  `json:"dealsLeft"`
	Keeps     bool     `json:"keeps"`
	PerStack  *Effect  `json:"perStack"`
	PerSpent  float64  `json:"perSpent"`
	MaxTotal  float64  `json:"maxTotal"`
	MaxShare  float64  `json:"maxShare"`
	Refresh   bool     `json:"refresh"`
	Apply     bool     `json:"apply"`
}

// StatusIDs is what a consume or extend works on, from `status` and `statuses`.
func (e *Effect) StatusIDs() []string {
	if e.Status == "" {
		return e.Statuses
	}
	return append([]string{e.Status}, e.Statuses...)
}

// Status is what the game needs of a status so far.
type Status struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	Kind       string         `json:"kind"`
	Duration   float64        `json:"duration"`
	Effects    []StatusEffect `json:"effects"`
	Stacking   string         `json:"stacking"` // refresh, stack or replace, which is what leaving it out means
	MaxStacks  int            `json:"maxStacks"`
	Limit      int            `json:"limit"`
	Leash      float64        `json:"leash"`
	Group      string         `json:"group"`
	BreaksOn   []string       `json:"breaksOn"`
	KeptBy     *KeptBy        `json:"keptBy"`
	ConsumedBy *ConsumedBy    `json:"consumedBy"`
}

// KeptBy lists the abilities that don't break a status with `breaksOn: ["action"]`.
type KeptBy struct {
	Abilities []string `json:"abilities"`
	Tags      []string `json:"tags"`
}

// Keeps says whether using an ability leaves the status on.
func (k *KeptBy) Keeps(a *Ability) bool {
	return k != nil && (slices.Contains(k.Abilities, a.ID) || slices.ContainsFunc(a.Tags, func(t string) bool { return slices.Contains(k.Tags, t) }))
}

// ConsumedBy says which of the holder's abilities use a status up, and how fast.
type ConsumedBy struct {
	Abilities []string `json:"abilities"`
	Tag       string   `json:"tag"`
	Uses      int      `json:"uses"`
	Stacks    int      `json:"stacks"`
}

// Matches says whether using an ability counts.
func (b *ConsumedBy) Matches(a *Ability) bool {
	return b != nil && (slices.Contains(b.Abilities, a.ID) || (b.Tag != "" && slices.Contains(a.Tags, b.Tag)))
}

// StatusEffect is what a status does while it's on.
type StatusEffect struct {
	Type   string
	Every  float64
	Does   string
	Amount Amount

	// A `stat`. Only `periodic` and `stat` have their numbers read so far.
	Stat       string
	Resource   string
	Add        float64
	Multiply   *float64
	FromStat   string
	Share      float64
	OfCaster   bool
	CasterOnly bool
	Hit        string
	Source     string
	School     string
	Schools    []string
	Category   string
	Categories []string
	Abilities  []string
	Tag        string
	Statuses   []string
	When       []Condition
}

// UnmarshalJSON reads the numbers of a periodic or stat effect, and just the type of the others.
func (s *StatusEffect) UnmarshalJSON(b []byte) error {
	var head struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(b, &head); err != nil {
		return err
	}
	s.Type = head.Type
	if head.Type != "periodic" && head.Type != "stat" {
		return nil
	}
	var body struct {
		Every      float64     `json:"every"`
		Does       string      `json:"does"`
		Amount     Amount      `json:"amount"`
		Stat       string      `json:"stat"`
		Resource   string      `json:"resource"`
		Add        float64     `json:"add"`
		Multiply   *float64    `json:"multiply"`
		FromStat   string      `json:"fromStat"`
		Share      float64     `json:"share"`
		OfCaster   bool        `json:"ofCaster"`
		CasterOnly bool        `json:"casterOnly"`
		Hit        string      `json:"hit"`
		Source     string      `json:"source"`
		School     string      `json:"school"`
		Schools    []string    `json:"schools"`
		Category   string      `json:"category"`
		Categories []string    `json:"categories"`
		Abilities  []string    `json:"abilities"`
		Tag        string      `json:"tag"`
		Statuses   []string    `json:"statuses"`
		When       []Condition `json:"when"`
	}
	if err := json.Unmarshal(b, &body); err != nil {
		return err
	}
	*s = StatusEffect{head.Type, body.Every, body.Does, body.Amount, body.Stat, body.Resource, body.Add, body.Multiply, body.FromStat, body.Share, body.OfCaster, body.CasterOnly,
		body.Hit, body.Source, body.School, body.Schools, body.Category, body.Categories, body.Abilities, body.Tag, body.Statuses, body.When}
	return nil
}

// Distance is feet, or melee reach.
type Distance struct {
	Feet  float64
	Melee bool
}

// UnmarshalJSON reads a number of feet or "melee".
func (d *Distance) UnmarshalJSON(b []byte) error {
	var word string
	if json.Unmarshal(b, &word) == nil {
		if word != "melee" {
			return fmt.Errorf("combat: bad range %q", word)
		}
		d.Melee = true
		return nil
	}
	return json.Unmarshal(b, &d.Feet)
}

// Amount is a number, [min, max], or parts that add up.
type Amount struct {
	Min, Max                              float64
	AttackPower, SpellPower, Weapon, Mast float64
}

// UnmarshalJSON reads each of an amount's three shapes.
func (a *Amount) UnmarshalJSON(b []byte) error {
	var parts struct {
		Base        json.RawMessage `json:"base"`
		AttackPower float64         `json:"attackPower"`
		SpellPower  float64         `json:"spellPower"`
		Weapon      float64         `json:"weapon"`
		Mastery     float64         `json:"mastery"`
	}
	if len(b) > 0 && b[0] == '{' {
		if err := json.Unmarshal(b, &parts); err != nil {
			return err
		}
		a.AttackPower, a.SpellPower, a.Weapon, a.Mast = parts.AttackPower, parts.SpellPower, parts.Weapon, parts.Mastery
		if len(parts.Base) == 0 {
			return nil
		}
		b = parts.Base
	}
	var pair [2]float64
	if len(b) > 0 && b[0] == '[' {
		if err := json.Unmarshal(b, &pair); err != nil {
			return err
		}
		a.Min, a.Max = pair[0], pair[1]
		return nil
	}
	var n float64
	if err := json.Unmarshal(b, &n); err != nil {
		return err
	}
	a.Min, a.Max = n, n
	return nil
}

// Ability finds one of the class's abilities.
func (c *Class) Ability(id string) *Ability {
	for i := range c.Abilities {
		if c.Abilities[i].ID == id {
			return &c.Abilities[i]
		}
	}
	return nil
}

// Knows says whether a character of this level has an ability. One that a specialization or talent
// gives isn't known until choosing those exists.
func (c *Class) Knows(a *Ability, level int) bool {
	if a.Level > level {
		return false
	}
	for _, s := range c.Specializations {
		if slices.Contains(s.Abilities, a.ID) {
			return false
		}
	}
	for _, tier := range c.Talents {
		for _, t := range tier {
			for _, g := range t.Grants {
				if g.Ability == a.ID {
					return false
				}
			}
		}
	}
	return true
}

// Status finds one of the class's statuses.
func (c *Class) Status(id string) *Status {
	for i := range c.Statuses {
		if c.Statuses[i].ID == id {
			return &c.Statuses[i]
		}
	}
	return nil
}
