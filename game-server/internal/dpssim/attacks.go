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

// pickPower mirrors tryNPCAttack's selection: a power is a candidate if any
// of its effects is npcEffectUsable and its CostAmount doesn't exceed
// resource, then one candidate is chosen uniformly at random - matching the
// real engine's current behavior of ignoring UnitType.Tactics entirely (see
// package doc). Returns false if no power is both usable and affordable
// right now.
func pickPower(powers []instanceconfig.Power, resource float64, rng *rand.Rand) (instanceconfig.Power, bool) {
	var available []instanceconfig.Power
	for _, p := range powers {
		if p.CostAmount > resource {
			continue
		}
		for _, eff := range p.Effects {
			if npcEffectUsable(eff) {
				available = append(available, p)
				break
			}
		}
	}
	if len(available) == 0 {
		return instanceconfig.Power{}, false
	}
	return available[rng.Intn(len(available))], true
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
