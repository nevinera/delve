package combat

import "slices"

// How the attack table comes out, and what a block does.
const (
	BlockShare  = 0.3 // what a block takes off a hit
	StartDodge  = 3.0
	StartParry  = 3.0
	ArmorBase   = 400.0
	ArmorLevel  = 85.0 // armor counts for less against higher levels
	ArmorMost   = 0.85
	LowestGCD   = 0.75
	ratingStart = 1.0
	ratingLevel = 0.5
)

// RatingPerPoint is how much rating makes a point of what it feeds at a level.
func RatingPerPoint(level int) float64 {
	return ratingStart + ratingLevel*float64(max(level, 1))
}

// other reads a stat that only Sheet works out.
func (s Stats) other(name string) float64 {
	if p, ok := s.Others[name]; ok {
		return *p
	}
	return 0
}

// Haste is the holder's haste, as a share: 0.1 is 10% faster.
func (s Stats) Haste() float64 { return max(s.other("haste"), 0) / 100 }

// Versatility is the holder's versatility, in points.
func (s Stats) Versatility() float64 { return s.other("versatility") }

// Hasted is how long something takes for someone with this haste.
func (s Stats) Hasted(seconds float64) float64 { return seconds / (1 + s.Haste()) }

// AttackRoll is how an attack comes out against someone with these stats: "miss", "dodge", "parry",
// or "" for a hit. It's one roll. Only melee can be dodged, and only from in front can it be parried.
func AttackRoll(on Stats, melee, front bool, roll func() float64) string {
	r, upTo := 100*roll(), MissChance*100
	if r < upTo {
		return "miss"
	}
	if melee {
		if upTo += on.Dodge; r < upTo {
			return "dodge"
		}
		if front {
			if upTo += on.Parry; r < upTo {
				return "parry"
			}
		}
	}
	return ""
}

// Blocks says whether a melee hit from in front gets blocked. It's a roll of its own.
func Blocks(on Stats, melee, front bool, roll func() float64) bool {
	return melee && front && on.Block > 0 && 100*roll() < on.Block
}

// Armored is what armor leaves of physical damage from someone of this level.
func (s Stats) Armored(n float64, schools []string, level int) float64 {
	armor := s.other("armor")
	if armor <= 0 || !slices.Contains(schools, "physical") {
		return n
	}
	return n * (1 - min(armor/(armor+ArmorBase+ArmorLevel*float64(max(level, 1))), ArmorMost))
}

// Taken is what's left of a hit on someone with these stats, from someone of this level: armor,
// avoidance against areas and half of versatility, as well as what it holds.
func (s Stats) Taken(n float64, ctx HitContext, level int) float64 {
	n = s.Armored(n, ctx.Schools, level) * s.DamageTaken * (1 - s.other("versatility")/200)
	if slices.Contains(ctx.Kinds, "area") {
		n *= 1 - min(max(s.other("avoidance"), 0), 100)/100
	}
	return n
}
