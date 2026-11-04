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
	Passives        []Passive           `json:"passives"`
	Mastery         *Mastery            `json:"mastery"`
}

// Passive is a status a class has from a level on.
type Passive struct {
	Status string `json:"status"`
	Level  int    `json:"level"`
}

// Mastery is the status a class always has, whose numbers use the mastery stat.
type Mastery struct {
	Status string `json:"status"`
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
	Animation       string      `json:"animation"`
	Ignores         []string    `json:"-"` // what a `modify` lets it be used through
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

	Param string `json:"param"` // names its number, for a `modify`

	SoftCap int     `json:"softCap"` // past this many hit, those hit share this many's worth
	Drain   float64 `json:"drain"`   // heals the caster by this share of what it does

	// What a `modify` adds, worked out as it's used.
	CritChance float64 `json:"-"`
	CritDamage float64 `json:"-"`
	ByHits     []Mod   `json:"-"` // those that wait to see how many the ability hits
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

	TickRate float64 `json:"-"` // how much faster than `every` its periodic effects tick, once a `modify` says
}

// Period is how often this status's periodic effect ticks.
func (s *Status) Period(e *StatusEffect) float64 {
	if s.TickRate > 0 {
		return e.Every / s.TickRate
	}
	return e.Every
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
	Mastery    float64
	Param      string
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

	// A `modify`.
	Change       string
	Set          *float64
	AddAmount    *Amount
	AddTags      []string
	Chance       float64
	AtTargets    int
	PerTargetHit float64
	MaxTotal     float64

	// A `periodic`.
	Affects string
	Radius  float64
	Max     int
	SoftCap int
	Drain   float64

	// A `trigger`.
	On          string
	Effect      *Effect
	Cooldown    float64
	ResetOn     string
	SpendsStack bool
	Of          string
	NotOnHolder bool
	AtStacks    int
	AtMax       bool
	Resets      bool
	Threshold   float64

	AddEffects    []Effect
	StatusEffects []StatusEffect
	Overrides     map[string]json.RawMessage
	Ignores       []string
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
	if head.Type != "periodic" && head.Type != "stat" && head.Type != "modify" && head.Type != "trigger" {
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
		Mastery    float64     `json:"mastery"`
		Param      string      `json:"param"`
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

		Change       string   `json:"change"`
		Set          *float64 `json:"set"`
		AddAmount    *Amount  `json:"addAmount"`
		AddTags      []string `json:"addTags"`
		Chance       float64  `json:"chance"`
		AtTargets    int      `json:"atTargets"`
		PerTargetHit float64  `json:"perTargetHit"`
		MaxTotal     float64  `json:"maxTotal"`

		Affects string  `json:"affects"`
		Radius  float64 `json:"radius"`
		Max     int     `json:"max"`
		SoftCap int     `json:"softCap"`
		Drain   float64 `json:"drain"`

		On          string  `json:"on"`
		Effect      *Effect `json:"effect"`
		Cooldown    float64 `json:"cooldown"`
		ResetOn     string  `json:"resetOn"`
		SpendsStack bool    `json:"spendsStack"`
		Of          string  `json:"of"`
		NotOnHolder bool    `json:"notOnHolder"`
		AtStacks    int     `json:"atStacks"`
		AtMax       bool    `json:"atMax"`
		Resets      bool    `json:"resets"`
		Threshold   float64 `json:"threshold"`

		AddEffects    []Effect                   `json:"addEffects"`
		StatusEffects []StatusEffect             `json:"statusEffects"`
		Overrides     map[string]json.RawMessage `json:"overrides"`
		Ignores       []string                   `json:"ignores"`
	}
	if err := json.Unmarshal(b, &body); err != nil {
		return err
	}
	*s = StatusEffect{head.Type, body.Every, body.Does, body.Amount, body.Stat, body.Resource, body.Add, body.Multiply, body.Mastery, body.Param, body.FromStat, body.Share, body.OfCaster, body.CasterOnly,
		body.Hit, body.Source, body.School, body.Schools, body.Category, body.Categories, body.Abilities, body.Tag, body.Statuses, body.When,
		body.Change, body.Set, body.AddAmount, body.AddTags, body.Chance, body.AtTargets, body.PerTargetHit, body.MaxTotal,
		body.Affects, body.Radius, body.Max, body.SoftCap, body.Drain,
		body.On, body.Effect, body.Cooldown, body.ResetOn, body.SpendsStack, body.Of, body.NotOnHolder, body.AtStacks, body.AtMax, body.Resets, body.Threshold,
		body.AddEffects, body.StatusEffects, body.Overrides, body.Ignores}
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
	ByMastery                             float64
	MaxHealth                             float64 // a share of the maximum health of whoever it affects
	ShareOfTrigger                        float64 // a share of what set off the trigger
}

// UnmarshalJSON reads each of an amount's three shapes.
func (a *Amount) UnmarshalJSON(b []byte) error {
	var parts struct {
		Base           json.RawMessage `json:"base"`
		AttackPower    float64         `json:"attackPower"`
		SpellPower     float64         `json:"spellPower"`
		Weapon         float64         `json:"weapon"`
		Mastery        float64         `json:"mastery"`
		ByMastery      float64         `json:"byMastery"`
		MaxHealth      float64         `json:"maxHealth"`
		ShareOfTrigger float64         `json:"shareOfTrigger"`
	}
	if len(b) > 0 && b[0] == '{' {
		if err := json.Unmarshal(b, &parts); err != nil {
			return err
		}
		a.AttackPower, a.SpellPower, a.Weapon, a.Mast = parts.AttackPower, parts.SpellPower, parts.Weapon, parts.Mastery
		a.ByMastery, a.MaxHealth, a.ShareOfTrigger = parts.ByMastery, parts.MaxHealth, parts.ShareOfTrigger
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

// HeldFrom is the ids of the statuses a character of this level always holds.
func (c *Class) HeldFrom(level int) []string {
	var out []string
	for _, p := range c.Passives {
		if p.Level <= level {
			out = append(out, p.Status)
		}
	}
	if c.Mastery != nil && c.Mastery.Status != "" {
		out = append(out, c.Mastery.Status)
	}
	return out
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
