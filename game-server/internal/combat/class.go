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
	Units        []ClassUnit `json:"units"`
	ID           string      `json:"id"`
	Name         string      `json:"name"`
	PrimaryStats []string    `json:"primaryStats"`
	Resources    []Resource  `json:"resources"`
	Abilities    []Ability   `json:"abilities"`
	Statuses     []Status    `json:"statuses"`
	// What it can hold, best first.
	Weapons  []string `json:"weapons"`
	Offhands []string `json:"offhands"`
	// What it holds before a specialization asks for something else.
	StartingGear StartingGear `json:"startingGear"`
	// What a character chooses gives these abilities, so level alone doesn't.
	Specializations []Specialization    `json:"specializations"`
	Talents         map[string][]Talent `json:"talents"`
	Passives        []Passive           `json:"passives"`
	Mastery         *Mastery            `json:"mastery"`
}

// StartingGear is what a class holds to begin with. Either one left out is the first in the class's list.
type StartingGear struct {
	Weapon  string `json:"weapon"`
	Offhand string `json:"offhand"`
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
	Status    string   `json:"status"`
	Abilities []string `json:"abilities"`
}

// Talent is one choice in a talent tier.
type Talent struct {
	ID       string        `json:"id"`
	Requires string        `json:"requires"` // a talent in the tier directly above
	Grants   []TalentGrant `json:"grants"`
}

// TalentGrant is an ability or status a talent gives, to one specialization if it says.
type TalentGrant struct {
	Ability string `json:"ability"`
	Status  string `json:"status"`
	Spec    string `json:"spec"`
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
	ID              string        `json:"id"`
	Name            string        `json:"name"`
	Level           int           `json:"level"`
	School          string        `json:"school"`
	Schools         []string      `json:"schools"`
	Target          string        `json:"target"` // enemy, ally, self, ground or none
	Range           Distance      `json:"range"`
	MinRange        float64       `json:"minRange"`
	Facing          *bool         `json:"facing"`
	CastTime        float64       `json:"castTime"`
	CastWhileMoving bool          `json:"castWhileMoving"`
	Channel         *Channel      `json:"channel"`
	GCD             *float64      `json:"gcd"`
	GCDHasted       *bool         `json:"gcdHasted"`
	Cooldown        float64       `json:"cooldown"`
	CooldownHasted  bool          `json:"cooldownHasted"`
	Charges         int           `json:"charges"`
	Cost            []Cost        `json:"cost"`
	Speed           float64       `json:"speed"`
	Effects         []Effect      `json:"effects"`
	Requires        []Condition   `json:"requires"`
	Tags            []string      `json:"tags"`
	Animation       string        `json:"animation"`
	ExtraTargets    *ExtraTargets `json:"extraTargets"`
	WhileCasting    bool          `json:"whileCasting"`
	Replaces        string        `json:"replaces"`
	Ignores         []string      `json:"-"` // what a `modify` lets it be used through

	// What a `modify` says about what it spends.
	SpentAs      float64 `json:"-"` // it counts as spending this much
	SpentAsMax   bool    `json:"-"` // or the most it can
	SpendsUpTo   float64 `json:"-"` // it can spend this much more
	ByExtraSpent float64 `json:"-"`
}

// Channel is an ability that goes on for Duration seconds, landing its effects Ticks times.
type Channel struct {
	Duration    float64 `json:"duration"`
	Ticks       int     `json:"ticks"`
	CostPerTick *Cost   `json:"costPerTick,omitempty"`
}

// Cost is what using an ability spends.
type Cost struct {
	Resource string  `json:"resource"`
	Amount   float64 `json:"amount"`
	Percent  float64 `json:"percent"` // of the resource's most

	All       bool        `json:"all"`            // spends all you have, needing at least Amount
	UpTo      float64     `json:"upTo"`           // spends more if you have it, up to this in all
	PerSecond float64     `json:"perSecond"`      // spends this each second of a channel
	When      []Condition `json:"when,omitempty"` // it only counts while these hold
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

	// cooldown
	Abilities []string `json:"abilities"`
	Tag       string   `json:"tag"`
	By        float64  `json:"by"`
	Reset     bool     `json:"reset"`
	Charges   int      `json:"charges"`

	// dispel
	Dispels []string `json:"dispels"`
	Count   int      `json:"count"`
	Tags    []string `json:"tags"`

	Lockout float64 `json:"lockout"` // interrupt

	// castAbility
	Ability  string  `json:"ability"`
	Free     bool    `json:"free"`
	Strength float64 `json:"strength"`
	Level    int     `json:"level"`

	// Crits.
	AlwaysCrit     bool        `json:"alwaysCrit"`
	AlwaysCritWhen []Condition `json:"alwaysCritWhen"`
	ScalesWithCrit bool        `json:"scalesWithCrit"`
	CritMultiplier float64     `json:"critMultiplier"`

	// Who it reaches, and how they share it.
	Split        bool      `json:"split"`
	Others       float64   `json:"others"`
	Prefers      string    `json:"prefers"`
	Holding      []string  `json:"holding"`
	ExceptTarget bool      `json:"exceptTarget"`
	PerCount     *PerCount `json:"perCount"`
	AreaHeight   float64   `json:"-"`

	// What was spent.
	DurationPerSpent float64  `json:"durationPerSpent"`
	Chance           *float64 `json:"chance"`
	ChancePerSpent   float64  `json:"chancePerSpent"`
	ByExtraSpent     float64  `json:"byExtraSpent"`

	// area
	Lasts         float64  `json:"lasts"`
	Every         float64  `json:"every"`
	Effect        *Effect  `json:"effect"`
	Effects       []Effect `json:"effects"`
	OnEnter       *Effect  `json:"onEnter"`
	Limit         int      `json:"limit"`
	Overlaps      bool     `json:"overlaps"`
	FollowsTarget bool     `json:"followsTarget"`
	Line          bool     `json:"line"`
	Width         float64  `json:"width"`
	Along         string   `json:"along"`

	// move
	Kind     string  `json:"kind"`
	To       string  `json:"to"`
	Distance float64 `json:"distance"`
	Speed    float64 `json:"speed"`
	Height   float64 `json:"height"`
	Flying   bool    `json:"flying"`

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

// ClassUnit is something a class summons or turns you into, as far as the game reads it so far.
type ClassUnit struct {
	ID   string          `json:"id"`
	Name string          `json:"name"`
	Look json.RawMessage `json:"look"`
}

// PerCount is a number counting once for each of something.
type PerCount struct {
	StatusStacks     string             `json:"statusStacks"`
	StatusesFromMe   bool               `json:"statusesFromMe"`
	StatusesOnTarget []string           `json:"statusesOnTarget"`
	Weights          map[string]float64 `json:"weights"`
	Resource         string             `json:"resource"`
	Holders          string             `json:"holders"`
	Add              float64            `json:"add"`
	Max              float64            `json:"max"`
}

// ExtraTargets spills a share of a hit onto others near whoever it hit.
type ExtraTargets struct {
	Max     int         `json:"max"`
	Radius  float64     `json:"radius"`
	Share   float64     `json:"share"`
	Hit     string      `json:"hit"`
	When    []Condition `json:"when"`
	SoftCap int         `json:"softCap"`
}

// ShareOf is a share of something the fight has kept track of.
type ShareOf struct {
	Of       string   `json:"of"`
	Share    float64  `json:"share"`
	Seconds  float64  `json:"seconds"`
	On       string   `json:"on"`
	Statuses []string `json:"statuses"`
	Resource string   `json:"resource"`
}

// ByMissingHealth grows an amount as health falls, to UpTo times as much at no health.
type ByMissingHealth struct {
	UpTo float64 `json:"upTo"`
	Of   string  `json:"of"`
}

// Status is what the game needs of a status so far.
type Status struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	Kind       string         `json:"kind"`
	Dispel     string         `json:"dispel"`
	Tags       []string       `json:"tags"`
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

// Dispelled says whether a `dispel` of these kinds or tags takes this status: by the kind marked on
// it, a tag, or a control its effects put on the holder.
func (s *Status) Dispelled(by *Effect) bool {
	if slices.ContainsFunc(by.Tags, func(t string) bool { return slices.Contains(s.Tags, t) }) {
		return true
	}
	if s.Dispel != "" && slices.Contains(by.Dispels, s.Dispel) {
		return true
	}
	for i := range s.Effects {
		e := &s.Effects[i]
		if e.Type == "control" && slices.Contains(by.Dispels, e.Control) {
			return true
		}
		if slices.Contains(by.Dispels, "slow") && e.slows() {
			return true
		}
	}
	return false
}

// Slows says whether this status lowers its holder's movement speed.
func (s *Status) Slows() bool {
	return slices.ContainsFunc(s.Effects, func(e StatusEffect) bool { return e.slows() })
}

// slows says whether this effect lowers its holder's movement speed.
func (e *StatusEffect) slows() bool {
	return e.Type == "stat" && e.Stat == "movementSpeed" && (e.Add < 0 || (e.Multiply != nil && *e.Multiply < 1))
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
	Type    string
	Control string
	Status  string // an `aura`'s

	Spill   *ExtraTargets // an `extraTargets`
	Becomes string        // a `modify`: what it turns the abilities into
	Into    string        // a `transform`: the unit whose look it gives
	From    string        // a `store`: whose doings it keeps a share of

	// A `modify` of crits.
	AlwaysCrit     bool
	AlwaysCritWhen []Condition
	ScalesWithCrit bool
	CritMultiplier float64

	// Those that go by what the ability that applied it spent, and a `modify` of what it spends.
	AddPerSpent      float64
	MultiplyPerSpent float64
	SpentAs          float64
	SpentAsMax       bool
	SpendsUpTo       float64
	ByExtraSpent     float64

	// An `immune` and an `untargetable`.
	Controls     []string
	All          bool
	Harmful      bool
	AfterSeconds float64
	OnlyBelow    float64

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
		Every      float64  `json:"every"`
		Does       string   `json:"does"`
		Amount     Amount   `json:"amount"`
		Stat       string   `json:"stat"`
		Resource   string   `json:"resource"`
		Add        float64  `json:"add"`
		Multiply   *float64 `json:"multiply"`
		Mastery    float64  `json:"mastery"`
		Param      string   `json:"param"`
		FromStat   string   `json:"fromStat"`
		Share      float64  `json:"share"`
		OfCaster   bool     `json:"ofCaster"`
		CasterOnly bool     `json:"casterOnly"`
		Hit        string   `json:"hit"`
		Source     string   `json:"source"`
		Control    string   `json:"control"`
		Status     string   `json:"status"`

		Becomes        string      `json:"becomes"`
		Into           string      `json:"into"`
		From           string      `json:"from"`
		AlwaysCrit     bool        `json:"alwaysCrit"`
		AlwaysCritWhen []Condition `json:"alwaysCritWhen"`
		ScalesWithCrit bool        `json:"scalesWithCrit"`
		CritMultiplier float64     `json:"critMultiplier"`

		AddPerSpent      float64         `json:"addPerSpent"`
		MultiplyPerSpent float64         `json:"multiplyPerSpent"`
		SpentAs          json.RawMessage `json:"spentAs"`
		SpendsUpTo       float64         `json:"spendsUpTo"`
		ByExtraSpent     float64         `json:"byExtraSpent"`

		Controls     []string `json:"controls"`
		All          bool     `json:"all"`
		Harmful      bool     `json:"harmful"`
		AfterSeconds float64  `json:"afterSeconds"`
		OnlyBelow    float64  `json:"onlyBelow"`

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
	spentAs, spentAsMax := 0.0, false
	if len(body.SpentAs) > 0 {
		if string(body.SpentAs) == `"max"` {
			spentAsMax = true
		} else if err := json.Unmarshal(body.SpentAs, &spentAs); err != nil {
			return err
		}
	}
	var spill *ExtraTargets
	if head.Type == "extraTargets" {
		spill = &ExtraTargets{}
		if err := json.Unmarshal(b, spill); err != nil {
			return err
		}
	}
	*s = StatusEffect{head.Type, body.Control, body.Status, spill, body.Becomes, body.Into, body.From, body.AlwaysCrit, body.AlwaysCritWhen, body.ScalesWithCrit, body.CritMultiplier, body.AddPerSpent, body.MultiplyPerSpent, spentAs, spentAsMax, body.SpendsUpTo, body.ByExtraSpent, body.Controls, body.All, body.Harmful, body.AfterSeconds, body.OnlyBelow, body.Every, body.Does, body.Amount, body.Stat, body.Resource, body.Add, body.Multiply, body.Mastery, body.Param, body.FromStat, body.Share, body.OfCaster, body.CasterOnly,
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
	PerSpent                              *Amount // an amount for each point spent
	ShareOf                               *ShareOf
	Minimum, Maximum                      *Amount // what it can't go past
	ByMissingHealth                       *ByMissingHealth
}

// Spending is an amount with its `perSpent` counted for this many points.
func (a Amount) Spending(points float64) Amount {
	if a.PerSpent == nil {
		return a
	}
	per := a.PerSpent.Spending(points)
	per.scale(points)
	a.PerSpent = nil
	a.Min += per.Min
	a.Max += per.Max
	a.AttackPower += per.AttackPower
	a.SpellPower += per.SpellPower
	a.Weapon += per.Weapon
	a.Mast += per.Mast
	a.MaxHealth += per.MaxHealth
	return a
}

// UnmarshalJSON reads each of an amount's three shapes.
func (a *Amount) UnmarshalJSON(b []byte) error {
	var parts struct {
		Base           json.RawMessage  `json:"base"`
		AttackPower    float64          `json:"attackPower"`
		SpellPower     float64          `json:"spellPower"`
		Weapon         float64          `json:"weapon"`
		Mastery        float64          `json:"mastery"`
		ByMastery      float64          `json:"byMastery"`
		MaxHealth      float64          `json:"maxHealth"`
		ShareOfTrigger float64          `json:"shareOfTrigger"`
		PerSpent       *Amount          `json:"perSpent"`
		ShareOf        *ShareOf         `json:"shareOf"`
		Minimum        *Amount          `json:"minimum"`
		Maximum        *Amount          `json:"maximum"`
		ByMissing      *ByMissingHealth `json:"byMissingHealth"`
	}
	if len(b) > 0 && b[0] == '{' {
		if err := json.Unmarshal(b, &parts); err != nil {
			return err
		}
		a.AttackPower, a.SpellPower, a.Weapon, a.Mast = parts.AttackPower, parts.SpellPower, parts.Weapon, parts.Mastery
		a.ByMastery, a.MaxHealth, a.ShareOfTrigger, a.PerSpent = parts.ByMastery, parts.MaxHealth, parts.ShareOfTrigger, parts.PerSpent
		a.ShareOf, a.Minimum, a.Maximum, a.ByMissingHealth = parts.ShareOf, parts.Minimum, parts.Maximum, parts.ByMissing
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

// Knows says whether a character of this level and build has an ability. The build has to be one
// Allowed gave back.
func (c *Class) Knows(a *Ability, level int, b Build) bool {
	if !c.reaches(a, level, b) {
		return false
	}
	for i := range c.Abilities {
		if o := &c.Abilities[i]; o.Replaces == a.ID && c.reaches(o, level, b) {
			return false // something you know takes its place
		}
	}
	return true
}

// reaches says whether an ability is within what a character of this level and build can have.
func (c *Class) reaches(a *Ability, level int, b Build) bool {
	if a.Level > level {
		return false
	}
	chosen := false
	for _, s := range c.Specializations {
		if slices.Contains(s.Abilities, a.ID) {
			if s.ID == b.Specialization {
				return true
			}
			chosen = true
		}
	}
	for _, g := range c.talentGrants(b) {
		if g.Ability == a.ID {
			return true
		}
	}
	for _, tier := range c.Talents {
		for _, t := range tier {
			chosen = chosen || slices.ContainsFunc(t.Grants, func(g TalentGrant) bool { return g.Ability == a.ID })
		}
	}
	return !chosen
}

// HeldFrom is the ids of the statuses a character of this level and build always holds.
func (c *Class) HeldFrom(level int, b Build) []string {
	var out []string
	for _, p := range c.Passives {
		if p.Level <= level {
			out = append(out, p.Status)
		}
	}
	if c.Mastery != nil && c.Mastery.Status != "" {
		out = append(out, c.Mastery.Status)
	}
	for _, s := range c.Specializations {
		if s.ID == b.Specialization && s.Status != "" {
			out = append(out, s.Status)
		}
	}
	for _, g := range c.talentGrants(b) {
		if g.Status != "" {
			out = append(out, g.Status)
		}
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
