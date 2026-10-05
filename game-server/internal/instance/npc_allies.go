package instance

import (
	"math"
	"math/rand"
	"strings"
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
// the most wounded eligible ally in range (plus, with a radius, the eligible
// allies around it), gAll every eligible ally in range. A heal is only
// eligible on a wounded ally, so a healer doesn't fire at a full-health pack.
func allyRecipients(unit *instancestate.UnitState, allies []*instancestate.UnitState, eff instanceconfig.PowerEffect, zone instanceconfig.Zone) []*instancestate.UnitState {
	if eff.Affects != "gTarget" {
		return eligibleAllies(unit, allies, eff)
	}
	best := mostWoundedAlly(unit, allies, eff)
	if best == nil {
		return nil
	}
	return withAllySplash(best, allies, eff, zone)
}

// mostWoundedAlly is who a gTarget effect aims at: the most wounded eligible
// ally in range, or nil if there's none.
func mostWoundedAlly(unit *instancestate.UnitState, allies []*instancestate.UnitState, eff instanceconfig.PowerEffect) *instancestate.UnitState {
	eligible := eligibleAllies(unit, allies, eff)
	if len(eligible) == 0 {
		return nil
	}
	best := eligible[0]
	for _, a := range eligible[1:] {
		if healthFraction(a) < healthFraction(best) {
			best = a
		}
	}
	return best
}

// eligibleAllies is every ally eff could land on from unit: just unit for
// self, otherwise allies within its range (a heal only counts the wounded).
func eligibleAllies(unit *instancestate.UnitState, allies []*instancestate.UnitState, eff instanceconfig.PowerEffect) []*instancestate.UnitState {
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
	return eligible
}

// withAllySplash is target plus, for a gTarget effect with a radius, every
// other ally within that radius of target that the effect could land on (a
// heal only reaches the wounded) - a splash centered on the target, so the
// caster's own range doesn't limit it.
func withAllySplash(target *instancestate.UnitState, allies []*instancestate.UnitState, eff instanceconfig.PowerEffect, zone instanceconfig.Zone) []*instancestate.UnitState {
	recipients := []*instancestate.UnitState{target}
	if eff.Radius <= 0 {
		return recipients
	}
	for _, a := range allies {
		if a == target || command.IsEvading(a) || (eff.Type == "heal" && a.Health >= a.MaxHealth) {
			continue
		}
		if command.WithinRadius(target, a, zone, eff.Radius) {
			recipients = append(recipients, a)
		}
	}
	return recipients
}

func healthFraction(u *instancestate.UnitState) float64 {
	if u.MaxHealth <= 0 {
		return 1
	}
	return u.Health / u.MaxHealth
}

// applyNPCAllyEffect applies one self/gTarget/gAll effect to its recipients.
func applyNPCAllyEffect(attackerID uuid.UUID, unit *instancestate.UnitState, allies []*instancestate.UnitState, eff instanceconfig.PowerEffect, timeBudget float64, zone instanceconfig.Zone, now time.Time, rng *rand.Rand) {
	applyNPCAllyEffectTo(attackerID, unit, allyRecipients(unit, allies, eff, zone), eff, timeBudget, zone, now, rng)
}

func applyNPCAllyEffectTo(attackerID uuid.UUID, unit *instancestate.UnitState, recipients []*instancestate.UnitState, eff instanceconfig.PowerEffect, timeBudget float64, zone instanceconfig.Zone, now time.Time, rng *rand.Rand) {
	for _, recipient := range recipients {
		switch eff.Type {
		case "status":
			command.ApplyStatus(recipient, unit, attackerID, *eff.Status, eff.Duration, zone, now)
		case "heal":
			amount := command.PowerEffectAmount(unit, zone, eff, timeBudget, true, false, rng)
			command.ApplyHeal(unit, recipient, amount, zone)
		case "resource":
			command.AdjustResource(recipient, eff.ResourceName, eff.Delta)
		}
	}
}

type hostileRef struct {
	id   uuid.UUID
	unit *instancestate.UnitState
}

// hostileRecipients picks who a hostile effect lands on: bTarget (and any
// other non-area value) is just the current target, plus - with a radius -
// every other living player within that radius of it, with line of sight
// from it; bAll is every living player on the caster's map within the
// effect's range with a clear line of sight, the current target included.
func hostileRecipients(eff instanceconfig.PowerEffect, unit *instancestate.UnitState, targetID uuid.UUID, target *instancestate.UnitState, zone instanceconfig.Zone, state *instancestate.InstanceState) []hostileRef {
	if eff.Affects != "bAll" {
		hit := []hostileRef{{targetID, target}}
		if eff.Radius <= 0 {
			return hit
		}
		for id, u := range state.Units {
			if u == target || !strings.HasPrefix(u.ZoneUnitIdentifier, "player:") || u.MapIdentifier != target.MapIdentifier || !u.Status.IsTargetable() {
				continue
			}
			if command.WithinRadius(target, u, zone, eff.Radius) {
				hit = append(hit, hostileRef{id, u})
			}
		}
		return hit
	}
	var hit []hostileRef
	for id, u := range state.Units {
		if !strings.HasPrefix(u.ZoneUnitIdentifier, "player:") || u.MapIdentifier != unit.MapIdentifier || !u.Status.IsTargetable() {
			continue
		}
		dx, dy := u.Position.X-unit.Position.X, u.Position.Y-unit.Position.Y
		if !npcEffectInRange(eff, math.Sqrt(dx*dx+dy*dy), unit, u) {
			continue
		}
		if !instanceconfig.LineOfSightClear(zone, unit.MapIdentifier, unit.Position.X, unit.Position.Y, u.Position.X, u.Position.Y) {
			continue
		}
		hit = append(hit, hostileRef{id, u})
	}
	return hit
}
