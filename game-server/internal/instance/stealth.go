package instance

import (
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// StealthSpeedFactor slows a stealthed unit's movement.
const StealthSpeedFactor = 0.6

// updateStealth breaks and restores NPC stealth (docs/schema/unit_type.md's
// Stealth). A unit whose type has a stealth rating drops stealth once it
// leaves idle (aggro, attacking and casting all start by engaging) or takes
// damage, and stays visible until it resets: it re-stealths on returning to
// idle after a leash, or on starting to respawn.
func updateStealth(state, prev *instancestate.InstanceState, zone instanceconfig.Zone) {
	for id, unit := range state.Units {
		ut, ok := zone.UnitTypes[unit.UnitTypeIdentifier]
		if !ok || ut.Stealth == nil {
			unit.Stealthed = false
			continue
		}
		before, existed := prev.Units[id]
		if !existed {
			continue
		}
		hideable := canHide(unit.Status)
		switch {
		case unit.Stealthed && (!hideable || unit.Health < before.Health):
			unit.Stealthed = false
		case !unit.Stealthed && hideable && !canHide(before.Status):
			unit.Stealthed = true
		}
	}
}

// canHide: a stealthy unit keeps (or regains) stealth only while idle or
// respawning.
func canHide(status instancestate.UnitStatus) bool {
	return status == instancestate.UnitStatusIdle || status == instancestate.UnitStatusRespawning
}
