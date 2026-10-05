package instance

import (
	"math/rand"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// resolveImpacts lands every in-flight projectile effect (a power with a
// Speed - see instanceconfig.Power.Speed) whose time has come. Its range was
// checked at cast, so it lands wherever the target is now; it fizzles if the
// target has died or left. A caster that died meanwhile still lands it.
func resolveImpacts(state *instancestate.InstanceState, zone instanceconfig.Zone, now time.Time, rng *rand.Rand) {
	if len(state.PendingImpacts) == 0 {
		return
	}
	pending := state.PendingImpacts
	state.PendingImpacts = nil
	for _, imp := range pending {
		if now.Before(imp.LandsAt) {
			state.PendingImpacts = append(state.PendingImpacts, imp)
			continue
		}
		caster, ok := state.Units[imp.CasterID]
		if !ok {
			continue
		}
		target, ok := state.Units[imp.TargetID]
		if !ok || !target.Status.IsTargetable() {
			continue
		}
		if imp.FromPlayer {
			command.ApplyPlayerTargetedEffect(imp.CasterID, caster, imp.TargetID, target, imp.Effect, imp.TimeBudget, zone, now, state, rng)
			continue
		}
		landNPCImpact(imp, caster, target, zone, now, state, rng)
	}
}

func landNPCImpact(imp instancestate.PendingImpact, caster, target *instancestate.UnitState, zone instanceconfig.Zone, now time.Time, state *instancestate.InstanceState, rng *rand.Rand) {
	if imp.Effect.Affects == "gTarget" {
		recipients := withAllySplash(target, npcAlliesFromState(caster, zone, state), imp.Effect, zone)
		applyNPCAllyEffectTo(imp.CasterID, caster, recipients, imp.Effect, imp.TimeBudget, zone, now, rng)
		return
	}
	for _, v := range hostileRecipients(imp.Effect, caster, imp.TargetID, target, zone, state) {
		applyNPCHostileEffect(imp.CasterID, v.id, caster, v.unit, imp.Effect, imp.TimeBudget, zone, now, state, rng)
	}
}

// queueNPCAllyImpact sends a gTarget effect on its way to the most wounded
// eligible ally (one aimed at the caster itself has no distance to fly, so it
// lands the same tick).
func queueNPCAllyImpact(attackerID uuid.UUID, unit *instancestate.UnitState, allies []*instancestate.UnitState, eff instanceconfig.PowerEffect, timeBudget float64, power instanceconfig.Power, now time.Time, state *instancestate.InstanceState) {
	best := mostWoundedAlly(unit, allies, eff)
	if best == nil {
		return
	}
	for id, u := range state.Units {
		if u == best {
			command.QueueImpact(state, instancestate.PendingImpact{
				CasterID: attackerID, TargetID: id, Effect: eff, TimeBudget: timeBudget,
				LandsAt: now.Add(command.ImpactDelay(unit, best, power)),
			})
			return
		}
	}
}
