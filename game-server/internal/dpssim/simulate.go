package dpssim

import (
	"math"
	"math/rand"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// Result is one Simulate run's output against a single TargetStats.
type Result struct {
	Duration float64 // seconds simulated

	BasicAttackDamage float64
	PowerDamage       float64
	StatusTickDamage  float64
	TotalDamage       float64

	DPS float64 // TotalDamage / Duration

	// TTD ("time to die") is MaxHealth / DPS - a derived convenience, not a
	// stochastic depletion run (see package doc). +Inf if DPS is 0.
	TTD float64
}

// Simulate runs enemy's basic attack and power/status usage against target
// for duration seconds of simulated time, using rng for every random roll
// (miss/crit/variance/avoidance/power choice) - pass a seeded *rand.Rand for
// a reproducible run, or a fresh one per call for independent Monte Carlo
// samples. See the package doc for exactly what this does and doesn't
// model.
func Simulate(enemy instanceconfig.UnitType, target TargetStats, duration float64, rng *rand.Rand) Result {
	res := Result{Duration: duration}

	nextBasicAttack := math.Inf(1)
	if enemy.AttackSpeed > 0 {
		nextBasicAttack = 0
	}
	nextPowerCheck := math.Inf(1)
	if hasUsablePower(enemy.Powers) {
		nextPowerCheck = 0
	}

	resource := enemy.Resource.DefaultValue
	lastResourceAt := 0.0
	powerReadyAt := map[string]float64{} // power name -> sim time it's next off cooldown
	tactics := &tacticsState{}
	lastPickAt := 0.0

	var statuses []*activeStatus

	add := func(field *float64) func(float64) {
		return func(dmg float64) {
			*field += dmg
			res.TotalDamage += dmg
		}
	}

	for {
		now := nextBasicAttack
		if nextPowerCheck < now {
			now = nextPowerCheck
		}
		for _, e := range statuses {
			if e.expiresAt < now {
				now = e.expiresAt
			}
			for _, t := range e.ticks {
				if t.nextTick < now {
					now = t.nextTick
				}
			}
		}
		if now >= duration || math.IsInf(now, 1) {
			break
		}

		resource = regenResource(resource, enemy.Resource.DefaultValue, enemy.Resource.ReturnRate, now-lastResourceAt)
		lastResourceAt = now

		if now == nextBasicAttack {
			dmg := basicAttackDamage(enemy, rng)
			add(&res.BasicAttackDamage)(incomingDamage(target, dmg, enemy.BasicAttackSchool != "magic", rng))
			nextBasicAttack = now + 1/enemy.AttackSpeed
		}

		if now == nextPowerCheck {
			pickDt := now - lastPickAt
			lastPickAt = now
			if power, ok := pickPower(enemy.Tactics, tactics, enemy.Powers, resource, powerReadyAt, now, pickDt, rng); ok {
				for _, eff := range power.Effects {
					if !npcEffectUsable(eff) {
						continue
					}
					switch eff.Type {
					case "harm":
						dmg := harmEffectDamage(eff, rng)
						add(&res.PowerDamage)(incomingDamage(target, dmg, eff.School != "magic", rng))
					case "status":
						statuses = applyStatus(statuses, *eff.Status, eff.Duration, now)
					case "resource":
						if eff.Affects == "self" {
							resource = clampResource(resource+eff.Delta, enemy.Resource.Max)
						}
					}
				}
				if power.CostAmount > 0 {
					resource = clampResource(resource-power.CostAmount, enemy.Resource.Max)
				}
				if power.Cooldown > 0 {
					powerReadyAt[power.Name] = now + power.Cooldown
				}
				nextPowerCheck = now + effectGlobalCooldown(power)
			} else if hasUsablePower(enemy.Powers) {
				// At least one power is the right shape to fire, just not
				// affordable or off cooldown this instant - both change with
				// time, so retry rather than parking nextPowerCheck at +Inf
				// forever.
				nextPowerCheck = now + resourceRetryInterval
			} else {
				nextPowerCheck = math.Inf(1)
			}
		}

		tickStatuses(statuses, now, target, rng, add(&res.StatusTickDamage))
		statuses = expireStatuses(statuses, now)
	}

	if duration > 0 {
		res.DPS = res.TotalDamage / duration
	}
	if res.DPS > 0 {
		res.TTD = target.MaxHealth / res.DPS
	} else {
		res.TTD = math.Inf(1)
	}
	return res
}
