package dpssim

import (
	"math"
	"math/rand"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// npcBasicAttackVariance mirrors internal/instance/unit_behavior.go's
// basicAttackVariance - the +/- fraction applied to a basic attack's mean
// damage. Distinct from a player's own (tighter) variance constant.
const npcBasicAttackVariance = 0.15

// basicAttackDamage mirrors tryNPCBasicAttack's swing math: a mean of
// DPS/AttackSpeed, +/- npcBasicAttackVariance, then the universal miss/crit
// roll. Returns 0 on a miss. Caller still owes this to incomingDamage for
// mitigation.
func basicAttackDamage(enemy instanceconfig.UnitType, rng *rand.Rand) float64 {
	missed, multiplier := rollOutcome(rng)
	if missed {
		return 0
	}
	mean := enemy.DPS / enemy.AttackSpeed
	lo, hi := mean*(1-npcBasicAttackVariance), mean*(1+npcBasicAttackVariance)
	raw := lo + rng.Float64()*(hi-lo)
	return math.Round(raw * multiplier)
}

// npcEffectUsable mirrors tryNPCAttack's same-named helper: reports whether
// eff is a type/shape this simulation knows how to fire at all (a harm with
// an amount, a status with a status, or a resource with a resourceName) -
// range/LOS/facing are assumed always satisfied against a stationary dummy
// (see package doc).
func npcEffectUsable(eff instanceconfig.PowerEffect) bool {
	switch eff.Type {
	case "harm":
		return eff.Amount != nil
	case "status":
		return eff.Status != nil
	case "resource":
		return eff.ResourceName != ""
	default:
		return false
	}
}

// harmEffectDamage mirrors PowerEffectAmount/effectAmount for a harm
// PowerEffect: roll the authored range, then the universal miss/crit roll.
// The stat-scaled bonus term in effectAmount always drops out for an NPC
// attacker (see package doc), so there's nothing else to add.
func harmEffectDamage(eff instanceconfig.PowerEffect, rng *rand.Rand) float64 {
	missed, multiplier := rollOutcome(rng)
	if missed {
		return 0
	}
	lo, hi := eff.Amount.Min(), eff.Amount.Max()
	rolled := lo + rng.Float64()*(hi-lo)
	return math.Round(rolled * multiplier)
}

// statusTickDamage mirrors StatusTickAmount/effectAmount for one recurring
// StatusEffect tick: same miss/crit roll as harmEffectDamage, but the base
// amount is the tick's own fixed Amount rather than a rolled range.
func statusTickDamage(eff instanceconfig.StatusEffect, rng *rand.Rand) float64 {
	missed, multiplier := rollOutcome(rng)
	if missed {
		return 0
	}
	return math.Round(eff.Amount * multiplier)
}

// tacticsState mirrors instancestate.BehaviorState's Tactics-relevant
// fields (RotationIndex, PhaseIndex, PhaseElapsed) - Simulate keeps its own
// local copy since it simulates one enemy over one continuous timeline
// rather than a live UnitState.
type tacticsState struct {
	rotationIndex int
	phaseIndex    int
	phaseElapsed  float64
}

// pickPower mirrors tryNPCAttack's selection: a power is a candidate if any
// of its effects is npcEffectUsable, its CostAmount doesn't exceed resource,
// and it's off its own per-power cooldown (readyAt, keyed by power name -
// absent or <= now means ready); which candidate fires is then driven by
// tactics (docs/schema/unit_type.md's UnitTactics), same as the real
// engine's instance.selectFromLeafTactics/advancePhase. dt is the elapsed
// time since this was last called, for phased's PhaseElapsed tracking -
// mirrors advancePhase running every real-engine tick regardless of GCD;
// here it's every time the event loop re-checks power selection, which is
// as fine-grained as this event-driven (not fixed-tick) simulation gets.
//
// "scripted" (top-level or a phased sub-phase) is still unimplemented -
// see package doc and nevinera/delve#109 - and never selects anything, same
// as the real engine. A "phased" HealthBelow transition also never fires
// here: Simulate never models the attacking enemy taking any damage of its
// own (see package doc's target-dummy scope), so its health never changes.
func pickPower(tactics instanceconfig.UnitTactics, state *tacticsState, powers []instanceconfig.Power, resource float64, readyAt map[string]float64, now, dt float64, rng *rand.Rand) (instanceconfig.Power, bool) {
	leaf := tactics
	if tactics.Type == "phased" {
		leaf = advancePhase(state, tactics.Phases, dt).Tactics
	}

	var available []instanceconfig.Power
	for _, p := range powers {
		if p.CostAmount > resource {
			continue
		}
		if t, onCooldown := readyAt[p.Name]; onCooldown && t > now {
			continue
		}
		for _, eff := range p.Effects {
			if npcEffectUsable(eff) {
				available = append(available, p)
				break
			}
		}
	}
	return selectFromLeafTactics(state, leaf, available, rng)
}

// advancePhase mirrors instance.advancePhase, minus HealthBelow support
// (see pickPower's doc comment) - only TimeElapsed transitions apply here.
// The last phase has no Transition and runs forever.
func advancePhase(state *tacticsState, phases []instanceconfig.Phase, dt float64) instanceconfig.Phase {
	if state.phaseIndex >= len(phases) {
		state.phaseIndex = 0
	}
	state.phaseElapsed += dt
	phase := phases[state.phaseIndex]
	t := phase.Transition
	if state.phaseIndex < len(phases)-1 && t != nil && t.TimeElapsed != nil && state.phaseElapsed >= *t.TimeElapsed {
		state.phaseIndex++
		state.phaseElapsed = 0
		phase = phases[state.phaseIndex]
	}
	return phase
}

// selectFromLeafTactics mirrors instance.selectFromLeafTactics.
func selectFromLeafTactics(state *tacticsState, tactics instanceconfig.UnitTactics, available []instanceconfig.Power, rng *rand.Rand) (instanceconfig.Power, bool) {
	switch tactics.Type {
	case "rotation":
		return selectRotation(state, tactics.Powers, available)
	case "priorityRotation":
		return selectPriorityRotation(tactics.Powers, available)
	case "scripted":
		return instanceconfig.Power{}, false
	default: // "" or "randomAvailable"
		if len(available) == 0 {
			return instanceconfig.Power{}, false
		}
		return available[rng.Intn(len(available))], true
	}
}

// selectRotation mirrors instance.selectRotation.
func selectRotation(state *tacticsState, order []string, available []instanceconfig.Power) (instanceconfig.Power, bool) {
	if len(order) == 0 {
		return instanceconfig.Power{}, false
	}
	if state.rotationIndex >= len(order) {
		state.rotationIndex = 0
	}
	name := order[state.rotationIndex]
	for _, p := range available {
		if p.Name == name {
			state.rotationIndex = (state.rotationIndex + 1) % len(order)
			return p, true
		}
	}
	return instanceconfig.Power{}, false
}

// selectPriorityRotation mirrors instance.selectPriorityRotation.
func selectPriorityRotation(order []string, available []instanceconfig.Power) (instanceconfig.Power, bool) {
	for _, name := range order {
		for _, p := range available {
			if p.Name == name {
				return p, true
			}
		}
	}
	return instanceconfig.Power{}, false
}

// hasUsablePower reports whether enemy has at least one power this
// simulation would ever fire - used once, up front, to decide whether
// Simulate's GCD loop runs at all.
func hasUsablePower(powers []instanceconfig.Power) bool {
	for _, p := range powers {
		for _, eff := range p.Effects {
			if npcEffectUsable(eff) {
				return true
			}
		}
	}
	return false
}

// effectGlobalCooldown mirrors tryNPCAttack's post-cast GCD update. Guards
// against a non-positive GlobalCooldown (an authoring bug, not a real
// gameplay rule) so Simulate's event loop can't stall on a zero-duration
// loop.
func effectGlobalCooldown(power instanceconfig.Power) float64 {
	if power.GlobalCooldown <= 0 {
		return 1e-6
	}
	return power.GlobalCooldown
}

// pendingCastEvent tracks a selected cast-time power between selection and
// completion - see Simulate's pendingCast.
type pendingCastEvent struct {
	power  instanceconfig.Power
	endsAt float64 // simulated seconds
}

// applyPowerEffects applies power's effects (mirrors tryNPCAttack's effect
// loop) and returns the updated statuses slice. Used both for an instant
// power (called immediately at selection) and a cast-time power (called at
// pendingCast.endsAt) - see Simulate.
func applyPowerEffects(power instanceconfig.Power, target TargetStats, statuses []*activeStatus, resource *float64, maxResource float64, now float64, rng *rand.Rand, addPowerDamage func(float64)) []*activeStatus {
	for _, eff := range power.Effects {
		if !npcEffectUsable(eff) {
			continue
		}
		switch eff.Type {
		case "harm":
			dmg := harmEffectDamage(eff, rng)
			addPowerDamage(incomingDamage(target, dmg, eff.School != "magic", rng))
		case "status":
			statuses = applyStatus(statuses, *eff.Status, eff.Duration, now)
		case "resource":
			if eff.Affects == "self" {
				*resource = clampResource(*resource+eff.Delta, maxResource)
			}
		}
	}
	return statuses
}
