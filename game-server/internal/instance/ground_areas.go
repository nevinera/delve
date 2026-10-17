package instance

import (
	"math/rand"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

type areaRecipient struct {
	id   uuid.UUID
	unit *instancestate.UnitState
}

// tickGroundAreas runs every live groundArea: when one is due it lands its
// OnTick effects on the units standing in it (at most one tick per server
// tick), and it is dropped once it expires or its caster is gone.
func tickGroundAreas(state *instancestate.InstanceState, zone instanceconfig.Zone, now time.Time, rng *rand.Rand) {
	if len(state.GroundAreas) == 0 {
		return
	}
	kept := state.GroundAreas[:0]
	for _, a := range state.GroundAreas {
		caster, ok := state.Units[a.CasterID]
		if !ok || !now.Before(a.ExpiresAt) {
			continue
		}
		if !now.Before(a.NextTickAt) {
			landAreaTick(a, caster, zone, now, state, rng)
			a.NextTickAt = a.NextTickAt.Add(a.TickInterval)
		}
		kept = append(kept, a)
	}
	state.GroundAreas = kept
}

// landAreaTick applies one area's OnTick effects to everyone currently inside
// it on the side(s) its Affects selects. A harm never lands on the friendly
// side (the caster for a player, its pack for an NPC).
func landAreaTick(a instancestate.GroundArea, caster *instancestate.UnitState, zone instanceconfig.Zone, now time.Time, state *instancestate.InstanceState, rng *rand.Rand) {
	landEffectsInArea(a, a.OnTick, caster, zone, now, state, rng)
}

// applyNPCShapedEffect lands an NPC's instant effect on everyone in its shape
// at cast, the same sides and rules as one tick of a ground area.
func applyNPCShapedEffect(casterID uuid.UUID, caster, target *instancestate.UnitState, eff instanceconfig.PowerEffect, timeBudget float64, zone instanceconfig.Zone, now time.Time, state *instancestate.InstanceState, rng *rand.Rand) {
	shape, ok := command.PlaceAreaShape(caster, target, eff)
	if !ok {
		return
	}
	a := instancestate.GroundArea{CasterID: casterID, MapIdentifier: caster.MapIdentifier, Shape: shape, Affects: eff.Affects, TimeBudget: timeBudget}
	landEffectsInArea(a, []instanceconfig.PowerEffect{eff}, caster, zone, now, state, rng)
}

func landEffectsInArea(a instancestate.GroundArea, effects []instanceconfig.PowerEffect, caster *instancestate.UnitState, zone instanceconfig.Zone, now time.Time, state *instancestate.InstanceState, rng *rand.Rand) {
	hostile, friendly := areaRecipients(a, caster, zone, state)
	if a.Affects == "bAll" || a.Affects == "all" {
		for _, r := range hostile {
			for _, eff := range effects {
				if !r.unit.Status.IsTargetable() {
					break
				}
				eff.Affects = "bAll"
				if a.FromPlayer {
					command.ApplyPlayerEffect(a.CasterID, caster, r.id, r.unit, eff, a.TimeBudget, zone, now, state, rng)
				} else {
					applyNPCHostileEffect(a.CasterID, r.id, caster, r.unit, eff, a.TimeBudget, zone, now, state, rng)
				}
			}
		}
	}
	if a.Affects == "gAll" || a.Affects == "all" {
		for _, r := range friendly {
			for _, eff := range effects {
				if !r.unit.Status.IsTargetable() {
					break
				}
				eff.Affects = "gAll"
				if a.FromPlayer {
					command.ApplyPlayerEffect(a.CasterID, caster, r.id, r.unit, eff, a.TimeBudget, zone, now, state, rng)
				} else {
					applyNPCAllyEffectTo(a.CasterID, caster, []*instancestate.UnitState{r.unit}, eff, a.TimeBudget, zone, now, rng)
				}
			}
		}
	}
}

// areaRecipients sorts the living units standing in a (by position alone, no
// line of sight) into the caster's hostile and friendly sides. For a player
// caster the hostile side is hostile or neutral NPCs, never players, and the
// friendly side is just the caster, until there are parties. For an NPC
// caster the hostile side is players and the friendly side its living pack.
func areaRecipients(a instancestate.GroundArea, caster *instancestate.UnitState, zone instanceconfig.Zone, state *instancestate.InstanceState) (hostile, friendly []areaRecipient) {
	var pack map[*instancestate.UnitState]bool
	if !a.FromPlayer {
		pack = map[*instancestate.UnitState]bool{}
		for _, u := range npcAlliesFromState(caster, zone, state) {
			pack[u] = true
		}
	}
	for id, u := range state.Units {
		if u.MapIdentifier != a.MapIdentifier || !u.Status.IsTargetable() || !a.Shape.Contains(u.Position.X, u.Position.Y, u.Radius) {
			continue
		}
		isPlayer := strings.HasPrefix(u.ZoneUnitIdentifier, "player:")
		switch {
		case a.FromPlayer && id == a.CasterID:
			friendly = append(friendly, areaRecipient{id, u})
		case a.FromPlayer && !isPlayer && (u.Hostility == "hostile" || u.Hostility == "neutral") && !command.IsEvading(u):
			hostile = append(hostile, areaRecipient{id, u})
		case !a.FromPlayer && isPlayer:
			hostile = append(hostile, areaRecipient{id, u})
		case !a.FromPlayer && pack[u] && !command.IsEvading(u):
			friendly = append(friendly, areaRecipient{id, u})
		}
	}
	return hostile, friendly
}
