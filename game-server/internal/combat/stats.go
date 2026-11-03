package combat

import (
	"fmt"
	"math/rand/v2"
	"strings"
)

// A character's numbers until gear and levels feed in.
const (
	WeaponDamage = 10.0 // what a swing does, until characters hold real weapons
	CritChance   = 0.05
	CritScale    = 2.0
	MeleeFt      = 15.0 // how far melee reaches, until units have their own reach
	GCDSeconds   = 1.5
)

// Stats are what a character's class and level give it.
type Stats struct {
	Strength, Agility, Intellect, Stamina float64
	AttackPower, SpellPower, MaxHealth    float64
}

// StatsFor works out a character's stats: its class's primary stats grow twice as fast as the rest.
func StatsFor(c *Class, level int) Stats {
	per := func(stat string) float64 {
		for _, p := range c.PrimaryStats {
			if p == stat {
				return 10 + 2*float64(level)
			}
		}
		return 5 + float64(level)
	}
	s := Stats{Strength: per("strength"), Agility: per("agility"), Intellect: per("intellect"), Stamina: 10 + 2*float64(level)}
	s.AttackPower = 2 * max(s.Strength, s.Agility)
	s.SpellPower = 2 * s.Intellect
	s.MaxHealth = 10 * s.Stamina
	return s
}

// MaxResource is how much of a resource a character can hold.
func MaxResource(r Resource) float64 {
	switch r.Kind {
	case "mana":
		return 1000
	case "points":
		return float64(max(r.Max, 1))
	default:
		return 100
	}
}

// StartResource is how much of a resource a character enters with: rage and points build from none.
func StartResource(r Resource) float64 {
	if r.Kind == "rage" || r.Kind == "points" {
		return 0
	}
	return MaxResource(r)
}

// RegenOf is how much of a resource comes back each second. Rage falls, and points do as their
// class says.
func RegenOf(r Resource) float64 {
	switch r.Kind {
	case "mana":
		return 20
	case "energy":
		return 10
	case "rage":
		return -1
	default:
		return r.Regen
	}
}

// Roll is what an amount comes to for someone with these stats, and whether it crit. roll gives
// numbers in [0, 1).
func Roll(a Amount, s Stats, canCrit bool, roll func() float64) (float64, bool) {
	n := a.Min + (a.Max-a.Min)*roll() + a.AttackPower*s.AttackPower + a.SpellPower*s.SpellPower + a.Weapon*WeaponDamage
	if canCrit && roll() < CritChance {
		return n * CritScale, true
	}
	return n, false
}

// DescribeAmount says what goes into an amount for someone with these stats.
func DescribeAmount(a Amount, s Stats) string {
	var parts []string
	if a.Min != 0 || a.Max != 0 {
		if a.Min == a.Max {
			parts = append(parts, fmt.Sprintf("%g", a.Min))
		} else {
			parts = append(parts, fmt.Sprintf("%g to %g", a.Min, a.Max))
		}
	}
	for _, p := range []struct {
		name         string
		share, value float64
	}{{"attack power", a.AttackPower, s.AttackPower}, {"spell power", a.SpellPower, s.SpellPower}, {"weapon", a.Weapon, WeaponDamage}} {
		if p.share != 0 {
			parts = append(parts, fmt.Sprintf("%g x %s %g", p.share, p.name, p.value))
		}
	}
	if len(parts) == 0 {
		return "0"
	}
	return strings.Join(parts, " + ")
}

// Random is the roll to use outside of tests.
func Random() float64 { return rand.Float64() }
