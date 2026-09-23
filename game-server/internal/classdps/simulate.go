package classdps

import (
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// simTickInterval is the fixed step Simulate's event loop advances by -
// mirrors instance.TickInterval's 100ms, but an order of magnitude finer:
// this package cares about precision (see docs/combat_balance.md's D=25
// target) more than it cares about matching the real tick cadence exactly,
// and 10ms steps over even a 1200s (20-minute) run are still comfortably
// fast to compute. See package doc for the event-driven-vs-fixed-dt
// tradeoff this represents.
const simTickInterval = 0.01

// simEpoch is an arbitrary zero point simulated time is measured from -
// command's functions take time.Time (the real engine's convention), so
// this package converts its own float64-seconds simulated clock to/from
// time.Time consistently around this epoch wherever it must call into real
// command functions. Nothing here is ever compared against the wall clock.
var simEpoch = time.Unix(0, 0)

func simTime(seconds float64) time.Time {
	return simEpoch.Add(time.Duration(seconds * float64(time.Second)))
}

// Result is one Simulate run's output.
type Result struct {
	Duration float64 // seconds simulated

	BasicAttackDamage float64
	PowerDamage       float64
	StatusTickDamage  float64
	TotalDamage       float64

	DPS float64 // TotalDamage / Duration
}

// Simulate runs the simulated character's basic attack and power rotation
// (per strategy) against a fixed target dummy for duration seconds.
//
// Unlike internal/dpssim (which threads its own *rand.Rand through every
// roll for reproducible, seeded runs), every random roll here happens
// inside the real internal/command functions this package calls - and
// those all use math/rand's package-level (global, unseeded-by-caller)
// source, not an injectable one. So a Simulate run is NOT reproducible run
// to run, only statistically convergent over a long-enough duration (the
// same tradeoff every InEpsilon-style test in this codebase's test suites
// already relies on). Flagged here rather than silently pretending
// otherwise with a decorative rng parameter - worth its own follow-up if
// deterministic replay ever actually matters (it would mean threading an
// injectable rand.Source through internal/command's exported functions,
// a much bigger change than this package).
func Simulate(cfg AttackerConfig, strategy Strategy, duration float64) Result {
	res := Result{Duration: duration}
	unit := newAttacker(cfg)
	target := newTargetDummy()
	zone := instanceconfig.Zone{}
	attackerID := uuid.New()

	powersByName := make(map[string]instanceconfig.Power, len(cfg.Class.Powers))
	for _, p := range cfg.Class.Powers {
		powersByName[p.Name] = p
	}

	add := func(field *float64) func(float64) {
		return func(dmg float64) {
			*field += dmg
			res.TotalDamage += dmg
		}
	}
	addBasicAttackDamage := add(&res.BasicAttackDamage)
	addPowerDamage := add(&res.PowerDamage)
	addStatusTickDamage := add(&res.StatusTickDamage)

	nextBasicAttackAt := 0.0

	for now := 0.0; now < duration; now += simTickInterval {
		nowTime := simTime(now)

		tickResourceRegen(unit, zone, simTickInterval)
		tickActiveStatuses(unit, unit, zone, nowTime, simTickInterval, addStatusTickDamage)
		tickActiveStatuses(target, unit, zone, nowTime, simTickInterval, addStatusTickDamage)

		if now >= nextBasicAttackAt {
			hastePct, critChancePct, statDPS := command.UnitCombatStats(unit, zone)
			physical := unit.DamageStatKey != "intellect"
			raw := command.BasicAttackDamage(critChancePct, statDPS)
			raw = command.ApplyDamageDoneBonus(unit, physical, raw)
			dealt := command.IncomingDamage(target, zone, raw, physical)
			addBasicAttackDamage(dealt)
			target.Health -= dealt
			nextBasicAttackAt = now + command.PlayerBasicAttackInterval(hastePct).Seconds()
		}

		if power, ok := selectPower(unit, target, strategy, powersByName, nowTime); ok {
			castPower(unit, target, attackerID, power, zone, nowTime, addPowerDamage)
		}
	}

	if duration > 0 {
		res.DPS = res.TotalDamage / duration
	}
	return res
}
