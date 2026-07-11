package instancestate

import (
	"slices"
	"time"

	"github.com/google/uuid"
)

// Clone returns a deep copy of the InstanceState. Mutations to the clone do
// not affect the original, and vice versa.
func (s *InstanceState) Clone() *InstanceState {
	units := make(map[uuid.UUID]*UnitState, len(s.Units))
	for id, u := range s.Units {
		units[id] = u.clone()
	}
	return &InstanceState{Units: units}
}

func (u *UnitState) clone() *UnitState {
	c := *u // copies all value-type fields

	if u.Target != nil {
		t := *u.Target
		c.Target = &t
	}
	c.ActiveStatusEffects = slices.Clone(u.ActiveStatusEffects)
	if u.PowerCooldowns != nil {
		c.PowerCooldowns = make(map[string]time.Time, len(u.PowerCooldowns))
		for k, v := range u.PowerCooldowns {
			c.PowerCooldowns[k] = v
		}
	}

	return &c
}
