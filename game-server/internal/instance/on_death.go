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

// fireDeathEffects fires the OnDeath power (docs/schema/unit_type.md) of
// every NPC that died since the previous tick. Deaths happen in many places
// (basic attacks, powers, status ticks, triggered effects), so rather than
// hooking each one this compares against prevState once per tick.
//
// The power fires from the corpse with no cost, cooldown or cast time:
// bAll hits players around it, gTarget/gAll reach its living packmates
// (never itself), and bTarget is whoever it was fighting when it died.
// Self-only effects are skipped - the unit is dead.
func fireDeathEffects(state, prevState *instancestate.InstanceState, zone instanceconfig.Zone, now time.Time, events *[]CombatEvent, rng *rand.Rand) {
	for id, unit := range state.Units {
		if strings.HasPrefix(unit.ZoneUnitIdentifier, "player:") || unit.Status != instancestate.UnitStatusDead {
			continue
		}
		prev, ok := prevState.Units[id]
		if !ok || prev.Status == instancestate.UnitStatusDead {
			continue
		}
		unitType, ok := zone.UnitTypes[unit.UnitTypeIdentifier]
		if !ok {
			continue
		}
		power, ok := unitType.DeathPower()
		if !ok {
			continue
		}
		targetID, target := deathTarget(prev, state)
		applyDeathPower(id, unit, targetID, target, power, zone, now, state, rng)
		eventTarget := id
		if target != nil {
			eventTarget = targetID
		}
		*events = append(*events, CombatEvent{AttackerID: id.String(), TargetID: eventTarget.String(), PowerName: power.Name})
	}
}

// deathTarget is the unit it was fighting just before it died (dying clears
// Target), if that unit is still around to be hit.
func deathTarget(prev *instancestate.UnitState, state *instancestate.InstanceState) (uuid.UUID, *instancestate.UnitState) {
	if prev.Target == nil {
		return uuid.Nil, nil
	}
	target, ok := state.Units[*prev.Target]
	if !ok || !target.Status.IsTargetable() {
		return uuid.Nil, nil
	}
	return *prev.Target, target
}

func applyDeathPower(unitID uuid.UUID, unit *instancestate.UnitState, targetID uuid.UUID, target *instancestate.UnitState, power instanceconfig.Power, zone instanceconfig.Zone, now time.Time, state *instancestate.InstanceState, rng *rand.Rand) {
	timeBudget := command.PowerEffectTimeBudget(power)
	var packmates []*instancestate.UnitState
	for _, a := range npcAlliesFromState(unit, zone, state) {
		if a != unit {
			packmates = append(packmates, a)
		}
	}
	for i, eff := range power.Effects {
		if !npcEffectUsable(eff) || eff.Affects == "self" {
			continue
		}
		if eff.IsGroundArea() {
			command.CreateGroundArea(unitID, unit, target, false, power, i, eff, now, state)
			continue
		}
		if eff.IsShaped() {
			applyNPCShapedEffect(unitID, unit, target, eff, timeBudget, zone, now, state, rng)
			continue
		}
		if isAllyAffects(eff.Affects) {
			applyNPCAllyEffect(unitID, unit, packmates, eff, timeBudget, zone, now, rng)
			continue
		}
		if eff.Affects != "bAll" {
			if target == nil {
				continue
			}
			dx, dy := target.Position.X-unit.Position.X, target.Position.Y-unit.Position.Y
			if !npcEffectInRange(eff, math.Sqrt(dx*dx+dy*dy), unit, target) {
				continue
			}
		}
		for _, v := range hostileRecipients(eff, unit, targetID, target, zone, state) {
			applyNPCHostileEffect(unitID, v.id, unit, v.unit, eff, timeBudget, zone, now, state, rng)
		}
	}
}

// endCasterDeathEffects drops the statuses and ground areas that end when
// their caster dies, for every unit that died since the previous tick. It
// runs before fireDeathEffects so an effect the dying unit's own onDeath power
// creates is not caught by it.
func endCasterDeathEffects(state, prevState *instancestate.InstanceState) {
	var died map[uuid.UUID]bool
	for id, unit := range state.Units {
		if unit.Status != instancestate.UnitStatusDead {
			continue
		}
		if prev, ok := prevState.Units[id]; ok && prev.Status != instancestate.UnitStatusDead {
			if died == nil {
				died = map[uuid.UUID]bool{}
			}
			died[id] = true
		}
	}
	if died == nil {
		return
	}
	for _, unit := range state.Units {
		kept := unit.ActiveStatusEffects[:0]
		for _, e := range unit.ActiveStatusEffects {
			if !e.Status.EndsOnCasterDeath || !died[e.ApplierID] {
				kept = append(kept, e)
			}
		}
		unit.ActiveStatusEffects = kept
	}
	areas := state.GroundAreas[:0]
	for _, a := range state.GroundAreas {
		if !a.EndsOnCasterDeath || !died[a.CasterID] {
			areas = append(areas, a)
		}
	}
	state.GroundAreas = areas
}
