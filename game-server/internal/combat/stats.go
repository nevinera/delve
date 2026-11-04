package combat

import (
	"fmt"
	"math/rand/v2"
	"strings"
)

// A character's numbers until gear and levels feed in.
const (
	WeaponDamage = 10.0 // what a swing does, until characters hold real weapons
	SwingSeconds = 2.0  // how long a swing takes, until characters hold real weapons
	MissChance   = 0.05
	MeleeFt      = 15.0 // how far melee reaches, until units have their own reach
	GCDSeconds   = 1.5
)

// Stats are what a character's class and level give it.
type Stats struct {
	Strength, Agility, Intellect, Stamina float64
	AttackPower, SpellPower, MaxHealth    float64

	// Percentages, in points. A crit does 100 + CritDamage percent, or CritHealing for a heal.
	CritChance, CritDamage, CritHealing, CritTaken, Leech float64
	MovementSpeed, AttackSpeed                            float64 // 100 is as fast as anyone goes

	// What multiplies what a unit does and takes.
	DamageDone, HealingDone, DamageTaken, HealingTaken float64

	Others map[string]*float64 // the rest, once Sheet's worked them out
}

// Plain is the stats of something with only health.
func Plain(health float64) Stats {
	return Stats{
		MaxHealth: health, CritChance: 5, CritDamage: 100, CritHealing: 100, MovementSpeed: 100, AttackSpeed: 100,
		DamageDone: 1, HealingDone: 1, DamageTaken: 1, HealingTaken: 1,
	}
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
	s := Plain(0)
	s.Strength, s.Agility, s.Intellect, s.Stamina = per("strength"), per("agility"), per("intellect"), 10+2*float64(level)
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

// RegenOf is how much of a resource comes back each second, in or out of combat. Points do as
// their class says.
func RegenOf(r Resource) float64 {
	switch r.Kind {
	case "mana":
		return 20
	case "energy":
		return 10
	case "rage":
		return 0
	default:
		return r.Regen
	}
}

// DecayOf is how much of a resource drains each second out of combat. Rage falls, and points do
// as their class says.
func DecayOf(r Resource) float64 {
	switch r.Kind {
	case "rage":
		return 1
	case "points":
		return r.Decay
	default:
		return 0
	}
}

// MasteryPercent is the holder's mastery, once Sheet's worked it out.
func (s Stats) MasteryPercent() float64 {
	if p, ok := s.Others["mastery"]; ok {
		return *p
	}
	return 0
}

// Roll is what an amount comes to for someone with these stats, and whether it crit. roll gives
// numbers in [0, 1).
func Roll(a Amount, s Stats, canCrit bool, roll func() float64) (float64, bool) {
	n := a.Min + (a.Max-a.Min)*roll() + a.AttackPower*s.AttackPower + a.SpellPower*s.SpellPower + a.Weapon*WeaponDamage
	mastery := s.MasteryPercent()
	n = (n + a.Mast*mastery) * (1 + a.ByMastery*mastery/100)
	if canCrit && roll() < s.CritChance/100 {
		return n * (1 + s.CritDamage/100), true
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

// Missed rolls whether an attack on an enemy misses.
func Missed(roll func() float64) bool { return roll() < MissChance }

// Random is the roll to use outside of tests.
func Random() float64 { return rand.Float64() }
