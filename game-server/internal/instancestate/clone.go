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
	ncus := make(map[uuid.UUID]*NCUState, len(s.NCUs))
	for id, n := range s.NCUs {
		c := *n
		ncus[id] = &c
	}
	return &InstanceState{Units: units, NCUs: ncus}
}

func (u *UnitState) clone() *UnitState {
	c := *u // copies all value-type fields

	if u.Target != nil {
		t := *u.Target
		c.Target = &t
	}
	if u.TaggedBy != nil {
		tb := *u.TaggedBy
		c.TaggedBy = &tb
	}
	if u.Resources != nil {
		c.Resources = make(map[string]*ResourceState, len(u.Resources))
		for name, r := range u.Resources {
			rc := *r
			c.Resources[name] = &rc
		}
	}
	c.ActiveStatusEffects = slices.Clone(u.ActiveStatusEffects)
	c.LootItems = make([]PendingLootItem, len(u.LootItems))
	for i, item := range u.LootItems {
		c.LootItems[i] = item
		c.LootItems[i].Claims = slices.Clone(item.Claims)
	}
	if u.PowerCooldowns != nil {
		c.PowerCooldowns = make(map[string]time.Time, len(u.PowerCooldowns))
		for k, v := range u.PowerCooldowns {
			c.PowerCooldowns[k] = v
		}
	}
	if u.Casting != nil {
		cast := *u.Casting
		if u.Casting.TargetID != nil {
			t := *u.Casting.TargetID
			cast.TargetID = &t
		}
		c.Casting = &cast
	}

	return &c
}
