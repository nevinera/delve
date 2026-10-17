package command

import (
	"math/rand"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// applyPlayerShapedEffect lands an instant effect on everyone standing in its
// shape at cast: a bAll effect on the hostile or neutral NPCs in it, a gAll
// effect on the caster if it stands in it (no parties yet). Like a ground
// area it ignores line of sight, but a shape anchored on or aimed at the
// target needs the target in range. Returns false if that range check fails.
func applyPlayerShapedEffect(unitID uuid.UUID, unit, target *instancestate.UnitState, effect instanceconfig.PowerEffect, timeBudget float64, zone instanceconfig.Zone, now time.Time, next *instancestate.InstanceState, rng *rand.Rand) bool {
	if effect.AreaNeedsTarget() {
		if target == nil {
			return true
		}
		if !inRangeAndLOS(unit, target, zone, effect.Range) {
			return false
		}
	}
	shape, ok := PlaceAreaShape(unit, target, effect)
	if !ok {
		return true
	}
	switch effect.Affects {
	case "gAll":
		if shape.Contains(unit.Position.X, unit.Position.Y, unit.Radius) {
			applyPlayerEffect(unitID, unit, unitID, unit, effect, timeBudget, zone, now, next, rng)
		}
	case "bAll":
		for id, u := range next.Units {
			if isPlayerHostileCandidate(unit, u) && shape.Contains(u.Position.X, u.Position.Y, u.Radius) {
				applyPlayerEffect(unitID, unit, id, u, effect, timeBudget, zone, now, next, rng)
			}
		}
	}
	return true
}
