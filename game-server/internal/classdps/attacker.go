package classdps

import (
	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// AttackerConfig is everything Simulate needs to build the simulated
// character's UnitState. Gear synthesis (Trainee Gear, elevation) and the
// elevation/duration spread around Simulate are separate layers built on
// top of this package - this package only knows how to run one cell, given
// an already-resolved EquippedItems map.
type AttackerConfig struct {
	Class         instanceconfig.CharacterClass
	EquippedItems map[string]instanceconfig.EquippedItem
}

// newAttacker builds the simulated character's UnitState from cfg - a real
// (if synthetic) UnitState, not a parallel lightweight struct, since real
// internal/command functions (ActiveStatModifiers in particular) read
// straight off UnitState.ActiveStatusEffects/EquippedItems/Resources.
func newAttacker(cfg AttackerConfig) *instancestate.UnitState {
	resources := make(map[string]*instancestate.ResourceState, len(cfg.Class.Resources))
	for _, r := range cfg.Class.Resources {
		resources[r.Name] = &instancestate.ResourceState{
			Current:          r.DefaultValue,
			Max:              r.Max,
			DefaultValue:     r.DefaultValue,
			ReturnRate:       r.ReturnRate,
			HasteAffected:    r.HasteAffected,
			RecoveryAffected: r.RecoveryAffected,
		}
	}
	unit := &instancestate.UnitState{
		ZoneUnitIdentifier:  "player:simulated",
		Status:              instancestate.UnitStatusIdle,
		EquippedItems:       cfg.EquippedItems,
		DamageStatKey:       cfg.Class.DamageStatKey(),
		Resources:           resources,
		PrimaryResourceName: cfg.Class.PrimaryResource().Name,
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{},
	}
	unit.MaxHealth = command.PlayerMaxHealth(unit, instanceconfig.Zone{})
	unit.Health = unit.MaxHealth
	return unit
}

// targetDummyHealth is arbitrarily large - the dummy never dies over the
// course of a run (this package's Result has no TTD; it's not a real fight
// simulation, see doc.go).
const targetDummyHealth = 1e9

// newTargetDummy is a fixed, zero-stat target - see the package doc for why
// this side never varies the way internal/dpsspread's target gearing does.
func newTargetDummy() *instancestate.UnitState {
	return &instancestate.UnitState{
		ZoneUnitIdentifier:  "target-dummy",
		Status:              instancestate.UnitStatusIdle,
		Health:              targetDummyHealth,
		MaxHealth:           targetDummyHealth,
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{},
	}
}
