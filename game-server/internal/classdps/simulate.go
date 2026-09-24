package classdps

import (
	"math/rand"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// simTickInterval is the fixed step Simulate's event loop advances by -
// mirrors instance.TickInterval's 100ms, but an order of magnitude finer:
// this package cares about precision (see docs/combat_balance.md's D=25
// target) more than it cares about matching the real tick cadence exactly,
// and 10ms steps over even a 1200s (20-minute) run are still comfortably
// fast to compute. See package doc for the event-driven-vs-fixed-dt
// tradeoff this represents.
const simTickInterval = 0.01

// resourceStatsRecalcInterval is how often Simulate recomputes
// hastePct/healingTakenPct for resource regen - matches instance.TickInterval
// (100ms), the granularity the real engine itself resolves this at (see
// instance.tickResourceRegen). Gear-derived stats don't change tick to
// tick, so recomputing them at simTickInterval's finer 10ms cadence (needed
// only for status-tick countdown precision) was pure waste: a full
// command.UnitCombatStats/HealingTakenPct call recomputes the attacker's
// entire itemstats.ScaledSum from scratch, and doing that up to 624,000
// times across one Matrix run (4 elevations x 3 durations, worst case
// 1200s at 10ms steps) was the dominant cost of an "Estimate DPS" click -
// several seconds of GC pressure from the resulting allocation churn.
// Recomputing at the real engine's own 100ms cadence instead is both 10x
// cheaper and more faithful to what the real engine actually does.
const resourceStatsRecalcInterval = 0.1

// simEpoch is an arbitrary zero point simulated time is measured from -
// command's functions take time.Time (the real engine's convention), so
// this package converts its own float64-seconds simulated clock to/from
// time.Time consistently around this epoch wherever it must call into real
// command functions. Nothing here is ever compared against the wall clock.
var simEpoch = time.Unix(0, 0)

func simTime(seconds float64) time.Time {
	return simEpoch.Add(time.Duration(seconds * float64(time.Second)))
}

// pendingCastState is a cast-time power selected but not yet resolved - see
// Simulate's pendingCast.
type pendingCastState struct {
	power  instanceconfig.Power
	endsAt float64 // simulated seconds
}

// Result is one Simulate run's output.
type Result struct {
	Duration float64 // seconds simulated

	BasicAttackDamage float64
	PowerDamage       float64
	StatusTickDamage  float64
	TriggeredDamage   float64 // "triggered" StatusEffect harm procs (#64)
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
func Simulate(cfg AttackerConfig, strategy Strategy, duration float64, rng *rand.Rand) Result {
	res := Result{Duration: duration}
	unit := newAttacker(cfg)
	target := newTargetDummy()
	zone := instanceconfig.Zone{}
	attackerID := uuid.New()
	targetID := uuid.New()
	// A "triggered" StatusEffect with affects: "target" resolves against
	// the holder's own current Target (command.FireTriggeredEffect) - this
	// package's whole simulated fight is a fixed 1v1, so that's set once
	// here rather than ever changing (no aggro/EngageOnAttack modeled -
	// see package doc). state is the minimal instancestate.InstanceState
	// FireTriggeredEffect needs to resolve that lookup.
	unit.Target = &targetID
	target.Target = &attackerID
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{attackerID: unit, targetID: target}}

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
	addTriggeredDamage := add(&res.TriggeredDamage)

	nextBasicAttackAt := 0.0

	needsHastePct, needsHealingTakenPct := resourceRegenNeedsStats(cfg.Class.Resources)
	var hastePctForRegen, healingTakenPctForRegen float64
	nextStatsRecalcAt := 0.0

	// pendingCast tracks a cast-time power between selection and completion -
	// see docs on castPower/applyPowerEffects. GCD/cooldown are already
	// committed (commitCooldowns) by the time this is set; cost is only
	// spent on successful completion (spendPowerCost), not selection -
	// selecting a cast only requires affording it.
	var pendingCast *pendingCastState

	for now := 0.0; now < duration; now += simTickInterval {
		nowTime := simTime(now)

		if now >= nextStatsRecalcAt {
			if needsHastePct {
				hastePctForRegen, _, _ = command.UnitCombatStats(unit, zone)
			}
			if needsHealingTakenPct {
				healingTakenPctForRegen = command.HealingTakenPct(unit, zone)
			}
			nextStatsRecalcAt = now + resourceStatsRecalcInterval
		}

		refreshStatusConditions(unit, unit, target)
		refreshStatusConditions(target, unit, unit)

		tickResourceRegen(unit, hastePctForRegen, healingTakenPctForRegen, simTickInterval)
		tickActiveStatuses(unit, unit, zone, nowTime, simTickInterval, addStatusTickDamage, rng)
		tickActiveStatuses(target, unit, zone, nowTime, simTickInterval, addStatusTickDamage, rng)

		if pendingCast != nil && now >= pendingCast.endsAt {
			applyPowerEffects(unit, target, attackerID, pendingCast.power, zone, nowTime, addPowerDamage, rng)
			spendPowerCost(unit, pendingCast.power)
			pendingCast = nil
		}

		if pendingCast == nil && now >= nextBasicAttackAt {
			hastePct, critChancePct, statDPS := command.UnitCombatStats(unit, zone)
			physical := unit.DamageStatKey != "intellect"
			raw := command.BasicAttackDamage(critChancePct, statDPS, rng)
			raw = command.ApplyDamageDoneBonus(unit, physical, raw)
			dealt := command.IncomingDamage(target, zone, raw, physical, rng)
			addBasicAttackDamage(dealt)
			target.Health -= dealt
			if dealt > 0 {
				unit.DamageDealtThisTick = true
				target.DamageTakenThisTick = true
			}
			nextBasicAttackAt = now + command.PlayerBasicAttackInterval(hastePct).Seconds()
		}

		if pendingCast == nil {
			if power, ok := selectPower(unit, target, strategy, powersByName, nowTime); ok {
				if castTime := power.CastTime; castTime != nil && *castTime > 0 {
					commitCooldowns(unit, power, nowTime)
					pendingCast = &pendingCastState{power: power, endsAt: now + *castTime}
				} else {
					castPower(unit, target, attackerID, power, zone, nowTime, addPowerDamage, rng)
				}
			}
		}

		processTriggeredEffects(attackerID, unit, zone, nowTime, simTickInterval, state, addTriggeredDamage, rng)
		processTriggeredEffects(targetID, target, zone, nowTime, simTickInterval, state, addTriggeredDamage, rng)
		unit.DamageTakenThisTick, unit.DamageDealtThisTick = false, false
		target.DamageTakenThisTick, target.DamageDealtThisTick = false, false
	}

	if duration > 0 {
		res.DPS = res.TotalDamage / duration
	}
	return res
}
