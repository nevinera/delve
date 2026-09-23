package classdps

import (
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// castPower applies power's effects then spends its cost and sets its
// GCD/cooldown - the instant-power path (see simulate.go's pendingCast for
// the cast-time-power split).
func castPower(unit, target *instancestate.UnitState, attackerID uuid.UUID, power instanceconfig.Power, zone instanceconfig.Zone, now time.Time, addPowerDamage func(float64)) {
	applyPowerEffects(unit, target, attackerID, power, zone, now, addPowerDamage)
	commitPowerCostAndCooldowns(unit, power, now)
}

// applyPowerEffects applies power's effects (mirrors UsePowerHandler.Handle's
// effect loop) - simplified for a fixed, always-in-range target dummy: no
// range/LOS/frontal checks, no aggro, no target death (the dummy has
// effectively infinite health, see attacker.go). A "heal" effect isn't
// credited toward any tracked Result total - see statuses.go's same note; a
// damage power with an incidental self-heal effect still applies it
// correctly, just uncounted.
//
// Split out from castPower so a cast-time power (simulate.go's pendingCast)
// can apply its effects at cast completion, separately from committing its
// cost/GCD/cooldown at cast start (commitPowerCostAndCooldowns).
func applyPowerEffects(unit, target *instancestate.UnitState, attackerID uuid.UUID, power instanceconfig.Power, zone instanceconfig.Zone, now time.Time, addPowerDamage func(float64)) {
	timeBudget := command.PowerEffectTimeBudget(power)
	for _, effect := range power.Effects {
		switch effect.Type {
		case "harm":
			if effect.Amount == nil {
				continue
			}
			physical := effect.School != "magic"
			raw := command.PowerEffectAmount(unit, zone, effect, timeBudget, false, false)
			raw = command.ApplyDamageDoneBonus(unit, physical, raw)
			dealt := command.IncomingDamage(target, zone, raw, physical)
			addPowerDamage(dealt)
			target.Health -= dealt
			if target.Health < 0 {
				target.Health = 0
			}
		case "heal":
			if effect.Amount == nil {
				continue
			}
			recipient := target
			if effect.Affects == "self" {
				recipient = unit
			}
			amount := command.PowerEffectAmount(unit, zone, effect, timeBudget, true, false)
			recipient.Health += amount * (1 + command.HealingTakenPct(recipient, zone)/100)
			if recipient.Health > recipient.MaxHealth {
				recipient.Health = recipient.MaxHealth
			}
		case "status":
			if effect.Status == nil {
				continue
			}
			recipient := target
			if effect.Affects == "self" {
				recipient = unit
			} else if command.IsHostileAffects(effect.Affects) {
				if missed, _ := command.RollAttackOutcome(0); missed {
					continue // resisted
				}
			}
			command.ApplyStatus(recipient, unit, attackerID, *effect.Status, effect.Duration, zone, now)
		case "resource":
			recipient := target
			if effect.Affects == "self" {
				recipient = unit
			}
			command.AdjustResource(recipient, effect.ResourceName, effect.Delta)
		}
	}
}

// commitPowerCostAndCooldowns spends power's resource cost and starts its
// GCD/own cooldown, for a successful instant power. A cast-time power
// splits this into commitCooldowns (selection time) and spendPowerCost
// (completion, cost only - see simulate.go's pendingCast) - starting a cast
// only requires affording it, not committing the cost up front.
func commitPowerCostAndCooldowns(unit *instancestate.UnitState, power instanceconfig.Power, now time.Time) {
	spendPowerCost(unit, power)
	commitCooldowns(unit, power, now)
}

// commitCooldowns starts power's GCD/own cooldown.
func commitCooldowns(unit *instancestate.UnitState, power instanceconfig.Power, now time.Time) {
	unit.GlobalCooldownEndsAt = now.Add(time.Duration(power.GlobalCooldown * float64(time.Second)))
	if power.Cooldown > 0 {
		if unit.PowerCooldowns == nil {
			unit.PowerCooldowns = make(map[string]time.Time)
		}
		unit.PowerCooldowns[power.Name] = now.Add(time.Duration(power.Cooldown * float64(time.Second)))
	}
}

// spendPowerCost deducts power's resource cost, if any.
func spendPowerCost(unit *instancestate.UnitState, power instanceconfig.Power) {
	if power.CostAmount > 0 {
		command.AdjustResource(unit, power.CostType, -power.CostAmount)
	}
}
