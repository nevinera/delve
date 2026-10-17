package command

import (
	"math"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/areashape"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// minAreaTickInterval keeps a tiny tickInterval from out-running the server's
// own tick (an area ticks at most once per server tick).
const minAreaTickInterval = 100 * time.Millisecond

// sameSpotFeet is how close a recast's origin must be to an existing area from
// the same caster and effect for it to refresh that area instead of adding one.
const sameSpotFeet = 1.0

// PlaceAreaShape puts effect's shape on the map: anchored on the caster or on
// target, and pointed toward target or the caster's facing. It returns false
// when the shape is anchored on a target that is nil.
func PlaceAreaShape(caster, target *instancestate.UnitState, effect instanceconfig.PowerEffect) (areashape.Shape, bool) {
	sh := effect.Shape
	if sh == nil {
		return areashape.Shape{}, false
	}
	placed := areashape.Shape{
		Kind: sh.Type, Radius: sh.Radius, InnerRadius: sh.InnerRadius, OuterRadius: sh.OuterRadius,
		Length: sh.Length, Width: sh.Width, Offset: sh.Offset,
		X: caster.Position.X, Y: caster.Position.Y, Angle: caster.Position.Angle,
	}
	if sh.At == "target" {
		if target == nil {
			return areashape.Shape{}, false
		}
		placed.X, placed.Y = target.Position.X, target.Position.Y
	}
	if effect.AreaAimsAtTarget() {
		if target == nil {
			return areashape.Shape{}, false
		}
		placed.Angle = math.Atan2(target.Position.X-caster.Position.X, target.Position.Y-caster.Position.Y) * 180 / math.Pi
	}
	return placed, true
}

// CreateGroundArea places a groundArea effect on caster's map and starts it.
// target is nil for an area anchored on the caster alone. A recast from the
// same caster and effect at (nearly) the same spot refreshes the existing
// area instead of adding another. Returns false if the effect can't be placed
// (it needs a target and there is none).
func CreateGroundArea(casterID uuid.UUID, caster, target *instancestate.UnitState, fromPlayer bool, power instanceconfig.Power, effectIndex int, effect instanceconfig.PowerEffect, now time.Time, state *instancestate.InstanceState) bool {
	shape, ok := PlaceAreaShape(caster, target, effect)
	if !ok || len(effect.OnTick) == 0 {
		return false
	}
	interval := time.Duration(effect.AreaTickSeconds() * float64(time.Second))
	if interval < minAreaTickInterval {
		interval = minAreaTickInterval
	}
	expires := now.Add(time.Duration(effect.Duration * float64(time.Second)))

	for i := range state.GroundAreas {
		a := &state.GroundAreas[i]
		if a.CasterID != casterID || a.PowerName != power.Name || a.EffectIndex != effectIndex || a.MapIdentifier != caster.MapIdentifier {
			continue
		}
		if math.Hypot(a.Shape.X-shape.X, a.Shape.Y-shape.Y) <= sameSpotFeet {
			a.Shape = shape
			a.ExpiresAt = expires
			return true
		}
	}

	state.GroundAreas = append(state.GroundAreas, instancestate.GroundArea{
		ID: uuid.New(), CasterID: casterID, FromPlayer: fromPlayer,
		PowerName: power.Name, EffectIndex: effectIndex, MapIdentifier: caster.MapIdentifier,
		Shape: shape, Affects: effect.Affects, OnTick: effect.OnTick,
		TimeBudget: interval.Seconds(), TickInterval: interval,
		NextTickAt: now.Add(interval), ExpiresAt: expires,
		Graphic: effect.Graphic, EndsOnCasterDeath: effect.EndsOnCasterDeath,
	})
	return true
}
