package instance

import (
	"math"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/command"
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

// healerRetargetCooldown is the minimum time between a "healerAggro" unit's
// target switches, so a healer swap mid-fight can't ping-pong it.
const healerRetargetCooldown = 6 * time.Second

// threatSwitchRatio is how far above its current target's threat another
// player must climb before an "aggroTable" unit switches to them.
const threatSwitchRatio = 1.1

// initialThreat seeds the table with whoever a unit first engages, so it
// doesn't drop them for the first player to land a hit.
const initialThreat = 1.0

// healingThreatFactor is the threat a healer generates per point of health
// restored (damage is 1 per point), on every engaged NPC on its map.
const healingThreatFactor = 0.5

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
// its UnitTargeting, or nil to keep its current target. "aggroTable" (the
// default) follows the threat table; an unrecognized type never switches. A
// unit mid-cast keeps its target.
func pickNPCTarget(unit *instancestate.UnitState, targeting instanceconfig.UnitTargeting, current *instancestate.UnitState, players []playerRef, now time.Time) *uuid.UUID {
	if unit.Casting != nil || current.MapIdentifier != unit.MapIdentifier {
		return nil
	}
	switch targeting.Type {
	case "", "aggroTable":
		return topThreat(unit, current, players)
	case "nearest":
		return nearestPlayer(unit, current, players)
	case "healerAggro":
		if now.Sub(unit.Behavior.LastRetargetAt) < healerRetargetCooldown {
			return nil
		}
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

// topThreat returns the player whose threat exceeds the current target's by
// threatSwitchRatio, if any - the highest such.
func topThreat(unit, current *instancestate.UnitState, players []playerRef) *uuid.UUID {
	var best *uuid.UUID
	bestThreat := unit.Behavior.Threat[currentID(unit)] * threatSwitchRatio
	for _, p := range players {
		if p.unit == current || !p.unit.Status.IsTargetable() {
			continue
		}
		if t := unit.Behavior.Threat[p.id]; t > bestThreat {
			id := p.id
			best, bestThreat = &id, t
		}
	}
	return best
}

// topThreatTarget returns the highest-threat living player, for a unit that
// has just lost its target.
func topThreatTarget(unit *instancestate.UnitState, players []playerRef) *uuid.UUID {
	var best *uuid.UUID
	bestThreat := 0.0
	for _, p := range players {
		if !p.unit.Status.IsTargetable() {
			continue
		}
		if t := unit.Behavior.Threat[p.id]; t > bestThreat {
			id := p.id
			best, bestThreat = &id, t
		}
	}
	return best
}

func currentID(unit *instancestate.UnitState) uuid.UUID {
	if unit.Target == nil {
		return uuid.Nil
	}
	return *unit.Target
}

// distributeHealingThreat turns the healing each unit restored since the
// last tick into threat on every engaged NPC on its map.
func distributeHealingThreat(state *instancestate.InstanceState) {
	for healerID, healer := range state.Units {
		if healer.HealingThreatPending <= 0 {
			continue
		}
		threat := healer.HealingThreatPending * healingThreatFactor
		healer.HealingThreatPending = 0
		if !strings.HasPrefix(healer.ZoneUnitIdentifier, "player:") {
			continue
		}
		for _, npc := range state.Units {
			if npc.Status == instancestate.UnitStatusEngaged && npc.MapIdentifier == healer.MapIdentifier {
				command.AddThreat(npc, healerID, threat)
			}
		}
	}
}
