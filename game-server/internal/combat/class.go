// Package combat holds what the game server knows of classes and abilities: reading them from a
// world's files, working out a character's stats, and rolling what an effect does. It knows nothing
// of connections or layers.
package combat

import (
	"encoding/json"
	"fmt"
)

// Class is the part of classes/<id>.json the game plays.
type Class struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	PrimaryStats []string   `json:"primaryStats"`
	Resources    []Resource `json:"resources"`
	Abilities    []Ability  `json:"abilities"`
	Statuses     []Status   `json:"statuses"`
}

// Resource is one of a class's resources. Kind is mana, energy, rage or points.
type Resource struct {
	Key   string  `json:"key"`
	Kind  string  `json:"kind"`
	Max   int     `json:"max"`
	Regen float64 `json:"regen"`
}

// Ability is what the game needs of an ability.
type Ability struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	School          string   `json:"school"`
	Target          string   `json:"target"` // enemy, ally, self, ground or none
	Range           Distance `json:"range"`
	MinRange        float64  `json:"minRange"`
	Facing          *bool    `json:"facing"`
	CastTime        float64  `json:"castTime"`
	CastWhileMoving bool     `json:"castWhileMoving"`
	Channel         *Channel `json:"channel"`
	GCD             *float64 `json:"gcd"`
	Cooldown        float64  `json:"cooldown"`
	Charges         int      `json:"charges"`
	Cost            []Cost   `json:"cost"`
	Speed           float64  `json:"speed"`
	Effects         []Effect `json:"effects"`
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
	Type     string  `json:"type"`
	Affects  string  `json:"affects"` // target, self, enemies or allies
	Around   string  `json:"around"`  // self, target or ground
	Radius   float64 `json:"radius"`
	Cone     float64 `json:"cone"`
	Max      int     `json:"max"`
	Amount   Amount  `json:"amount"`
	School   string  `json:"school"`
	Resource string  `json:"resource"`
	Status   string  `json:"status"`
	Duration float64 `json:"duration"`
}

// Status is what the game needs of a status so far.
type Status struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Kind     string  `json:"kind"`
	Duration float64 `json:"duration"`
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

// Status finds one of the class's statuses.
func (c *Class) Status(id string) *Status {
	for i := range c.Statuses {
		if c.Statuses[i].ID == id {
			return &c.Statuses[i]
		}
	}
	return nil
}
