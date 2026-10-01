package instanceconfig

// DefaultLeashRadius is how far (feet) an engaged NPC may get from where it
// was pulled before leashing applies, when neither its map nor the unit
// sets leashRadius - about WoW's 40 yards (our run speed matches WoW's).
const DefaultLeashRadius = 120.0

// Leash is a unit's resolved leash settings (see docs/schema/map.md and
// unit.md; instance/leash.go applies them).
type Leash struct {
	// Radius is the distance (feet) from the leash point beyond which the
	// NPC leashes once combat goes quiet, or immediately past 3x Radius.
	Radius float64
	// Hard leashes the moment the NPC leaves Radius, fight or no fight (for
	// boss encounters).
	Hard bool
}

// UnitLeash resolves a placed unit's leash settings: the unit's own values
// win, then its map's, then the defaults (DefaultLeashRadius, not hard).
func UnitLeash(m Map, u Unit) Leash {
	leash := Leash{Radius: DefaultLeashRadius}
	if m.LeashRadius != nil {
		leash.Radius = *m.LeashRadius
	}
	if u.LeashRadius != nil {
		leash.Radius = *u.LeashRadius
	}
	if m.HardLeash != nil {
		leash.Hard = *m.HardLeash
	}
	if u.HardLeash != nil {
		leash.Hard = *u.HardLeash
	}
	return leash
}
