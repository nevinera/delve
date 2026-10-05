package instance

import (
	"math"
	"math/rand"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// An NPC's allies are itself plus the living members of its pack (units
// sharing its groupIdentifier on the same map).

// isAllyAffects reports whether an effect's recipients are the caster or its
// allies rather than the hostile target.
func isAllyAffects(affects string) bool {
	return affects == "self" || affects == "gTarget" || affects == "gAll"
}

// npcAllies returns unit and its living packmates on its own map.
func npcAllies(unit *instancestate.UnitState, groupmates []string, stateByZoneID map[string]*instancestate.UnitState) []*instancestate.UnitState {
	allies := []*instancestate.UnitState{unit}
	for _, zoneID := range groupmates {
		other, ok := stateByZoneID[zoneID]
		if !ok || other.MapIdentifier != unit.MapIdentifier || !other.Status.IsTargetable() {
			continue
		}
		allies = append(allies, other)
	}
	return allies
}

// npcAlliesFromState is npcAllies for callers without the per-tick indexes
// (a cast resolving in tickCasts).
func npcAlliesFromState(unit *instancestate.UnitState, zone instanceconfig.Zone, state *instancestate.InstanceState) []*instancestate.UnitState {
	groupmates := instanceconfig.GroupedUnits(zone)[unit.ZoneUnitIdentifier]
	byZoneID := make(map[string]*instancestate.UnitState, len(groupmates))
	for _, u := range state.Units {
		byZoneID[u.ZoneUnitIdentifier] = u
	}
	return npcAllies(unit, groupmates, byZoneID)
}

// allyRecipients picks who eff lands on: self is just the caster, gTarget
// the most wounded eligible ally in range, gAll every eligible ally in
// range. A heal is only eligible on a wounded ally, so a healer doesn't
// fire at a full-health pack.
func allyRecipients(unit *instancestate.UnitState, allies []*instancestate.UnitState, eff instanceconfig.PowerEffect) []*instancestate.UnitState {
	maxRange := 5.0
	if eff.Range != nil {
		maxRange = eff.Range.Max()
	}
	var eligible []*instancestate.UnitState
	for _, a := range allies {
		if eff.Affects == "self" && a != unit {
			continue
		}
		if eff.Type == "heal" && a.Health >= a.MaxHealth {
			continue
		}
		if a != unit {
			if command.IsEvading(a) {
				continue
			}
			dx, dy := a.Position.X-unit.Position.X, a.Position.Y-unit.Position.Y
			if math.Sqrt(dx*dx+dy*dy) > maxRange+unit.Radius+a.Radius {
				continue
			}
		}
		eligible = append(eligible, a)
	}
	if eff.Affects != "gTarget" || len(eligible) <= 1 {
		return eligible
	}
	best := eligible[0]
	for _, a := range eligible[1:] {
		if healthFraction(a) < healthFraction(best) {
			best = a
		}
	}
	return []*instancestate.UnitState{best}
}

func healthFraction(u *instancestate.UnitState) float64 {
	if u.MaxHealth <= 0 {
		return 1
	}
	return u.Health / u.MaxHealth
}

// applyNPCAllyEffect applies one self/gTarget/gAll effect to its recipients.
func applyNPCAllyEffect(attackerID uuid.UUID, unit *instancestate.UnitState, allies []*instancestate.UnitState, eff instanceconfig.PowerEffect, timeBudget float64, zone instanceconfig.Zone, now time.Time, rng *rand.Rand) {
	for _, recipient := range allyRecipients(unit, allies, eff) {
		switch eff.Type {
		case "status":
			command.ApplyStatus(recipient, unit, attackerID, *eff.Status, eff.Duration, zone, now)
		case "heal":
			amount := command.PowerEffectAmount(unit, zone, eff, timeBudget, true, false, rng)
			recipient.Health += amount * (1 + command.HealingTakenPct(recipient, zone)/100)
			if recipient.Health > recipient.MaxHealth {
				recipient.Health = recipient.MaxHealth
			}
		case "resource":
			command.AdjustResource(recipient, eff.ResourceName, eff.Delta)
		}
	}
}
