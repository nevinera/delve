package itemstats

const (
	basePrimary             = 15.0
	baseSecondary           = 10.0
	primaryMissingBonus     = 0.8
	secondaryMissingBonus   = 0.6
	shieldDefenceMultiplier = 2.5
)

// slotShape describes a slot's point factor and stat shape, per
// docs/stats.md's "Slots" table.
type slotShape struct {
	factor            float64
	hasPrimary        bool
	maxSecondaries    int
	grantsBaseStamina bool
}

var slotShapes = map[string]slotShape{
	"head":      {factor: 1.5, hasPrimary: true, maxSecondaries: 3, grantsBaseStamina: true},
	"neck":      {factor: 1.0, hasPrimary: false, maxSecondaries: 3, grantsBaseStamina: false},
	"shoulders": {factor: 1.0, hasPrimary: true, maxSecondaries: 2, grantsBaseStamina: true},
	"back":      {factor: 1.0, hasPrimary: true, maxSecondaries: 2, grantsBaseStamina: true},
	"chest":     {factor: 1.5, hasPrimary: true, maxSecondaries: 3, grantsBaseStamina: true},
	"wrists":    {factor: 1.0, hasPrimary: true, maxSecondaries: 2, grantsBaseStamina: true},
	"hands":     {factor: 1.0, hasPrimary: true, maxSecondaries: 2, grantsBaseStamina: true},
	"waist":     {factor: 1.0, hasPrimary: true, maxSecondaries: 2, grantsBaseStamina: true},
	"legs":      {factor: 1.5, hasPrimary: true, maxSecondaries: 3, grantsBaseStamina: true},
	"feet":      {factor: 1.0, hasPrimary: true, maxSecondaries: 2, grantsBaseStamina: true},
	"ring":      {factor: 1.0, hasPrimary: false, maxSecondaries: 2, grantsBaseStamina: false},
	"main_hand": {factor: 2.0, hasPrimary: true, maxSecondaries: 3, grantsBaseStamina: false},
	"off_hand":  {factor: 2.0, hasPrimary: true, maxSecondaries: 3, grantsBaseStamina: false},
	"one_hand":  {factor: 2.0, hasPrimary: true, maxSecondaries: 3, grantsBaseStamina: false},
	"two_hand":  {factor: 4.0, hasPrimary: true, maxSecondaries: 3, grantsBaseStamina: false},
}

// Allocation is the subset of an item's fields needed to compute its raw
// stats: which slot it's in, whether it's a shield, and which primary/
// secondaries it rolls.
type Allocation struct {
	Slot        string
	Shield      bool
	Primary     *string
	Secondaries []string
}

// Raw computes an item's stat grants at em = 1.0 (ee = 0) - i.e. before any
// elevation scaling. See docs/stats.md ("Stat points" and "Slots").
func Raw(a Allocation) map[string]float64 {
	stats := make(map[string]float64)
	shape, ok := slotShapes[a.Slot]
	if !ok {
		return stats
	}

	isShield := a.Slot == "off_hand" && a.Shield
	hasPrimarySlot := shape.hasPrimary && !isShield
	primaryPresent := hasPrimarySlot && a.Primary != nil && *a.Primary != ""

	missingSecondaries := shape.maxSecondaries - len(a.Secondaries)
	if missingSecondaries < 0 {
		missingSecondaries = 0
	}

	bonus := 0.0
	if hasPrimarySlot && !primaryPresent {
		bonus += primaryMissingBonus
	}
	bonus += float64(missingSecondaries) * secondaryMissingBonus

	filledCount := len(a.Secondaries)
	if primaryPresent {
		filledCount++
	}

	bonusEach := 0.0
	if filledCount > 0 {
		bonusEach = bonus / float64(filledCount)
	}
	multiplier := (1 + bonusEach) * shape.factor

	if primaryPresent {
		stats[*a.Primary] += basePrimary * multiplier
	}
	for _, s := range a.Secondaries {
		stats[s] += baseSecondary * multiplier
	}

	if shape.grantsBaseStamina {
		stats["stamina"] += baseSecondary * shape.factor
	}

	if isShield {
		stats["defence_rating"] += shieldDefenceMultiplier * basePrimary * shape.factor
	}

	return stats
}
