package instance

import (
	"math"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// healingAggroHalfLife is how long (seconds) a player's RecentHealing takes
// to halve, so healerAggro follows who is healing now, not who once did.
const healingAggroHalfLife = 10.0

// retargetSlackFeet is how much closer another player must be before a
// "nearest" unit abandons its current target, so two equidistant players
// don't make it flip-flop every tick.
const retargetSlackFeet = 1.0

// healerSwitchRatio is how much more recent healing a player needs than the
// current target before a "healerAggro" unit switches to them.
const healerSwitchRatio = 1.25

// decayRecentHealing ages every unit's RecentHealing by dt.
func decayRecentHealing(state *instancestate.InstanceState, dt float64) {
	factor := math.Pow(0.5, dt/healingAggroHalfLife)
	for _, u := range state.Units {
		if u.RecentHealing > 0 {
			u.RecentHealing *= factor
			if u.RecentHealing < 0.01 {
				u.RecentHealing = 0
			}
		}
	}
}

// pickNPCTarget returns the player an engaged unit should switch to under
// its UnitTargeting, or nil to keep its current target. "aggroTable" (and
// anything unrecognized) never switches: there is no threat table, so a unit
// stays on whoever it engaged until they're gone. A unit mid-cast keeps its
// target too.
func pickNPCTarget(unit *instancestate.UnitState, targeting instanceconfig.UnitTargeting, current *instancestate.UnitState, players []playerRef) *uuid.UUID {
	if unit.Casting != nil || current.MapIdentifier != unit.MapIdentifier {
		return nil
	}
	switch targeting.Type {
	case "nearest":
		return nearestPlayer(unit, current, players)
	case "healerAggro":
		return topHealer(unit, current, players)
	}
	return nil
}

func nearestPlayer(unit, current *instancestate.UnitState, players []playerRef) *uuid.UUID {
	best, bestDist := (*uuid.UUID)(nil), distanceTo(unit, current)-retargetSlackFeet
	for _, p := range players {
		if p.unit == current || !p.unit.Status.IsTargetable() {
			continue
		}
		if d := distanceTo(unit, p.unit); d < bestDist {
			id := p.id
			best, bestDist = &id, d
		}
	}
	return best
}

func topHealer(unit, current *instancestate.UnitState, players []playerRef) *uuid.UUID {
	var best *uuid.UUID
	bestHealing := current.RecentHealing * healerSwitchRatio
	for _, p := range players {
		if p.unit == current || !p.unit.Status.IsTargetable() {
			continue
		}
		if p.unit.RecentHealing > bestHealing && p.unit.RecentHealing > 0 {
			id := p.id
			best, bestHealing = &id, p.unit.RecentHealing
		}
	}
	return best
}

func distanceTo(a, b *instancestate.UnitState) float64 {
	return math.Hypot(b.Position.X-a.Position.X, b.Position.Y-a.Position.Y)
}
