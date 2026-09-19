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

		if now == nextBasicAttack {
			dmg := basicAttackDamage(enemy, rng)
			add(&res.BasicAttackDamage)(incomingDamage(target, dmg, enemy.BasicAttackSchool != "magic", rng))
			nextBasicAttack = now + 1/enemy.AttackSpeed
		}

		if now == nextPowerCheck {
			if power, ok := pickPower(enemy.Powers, rng); ok {
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
					}
				}
				nextPowerCheck = now + effectGlobalCooldown(power)
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
