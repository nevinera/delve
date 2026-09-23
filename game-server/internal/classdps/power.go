package classdps

import (
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// castPower applies power's effects (mirrors UsePowerHandler.Handle's
// effect loop) then spends its cost and sets its GCD/cooldown - simplified
// for a fixed, always-in-range target dummy: no range/LOS/frontal checks,
// no aggro, no target death (the dummy has effectively infinite health, see
// attacker.go). A "heal" effect isn't credited toward any tracked Result
// total - see statuses.go's same note; a damage power with an incidental
// self-heal effect still applies it correctly, just uncounted.
func castPower(unit, target *instancestate.UnitState, attackerID uuid.UUID, power instanceconfig.Power, zone instanceconfig.Zone, now time.Time, addPowerDamage func(float64)) {
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

	if power.CostAmount > 0 {
		command.AdjustResource(unit, power.CostType, -power.CostAmount)
	}
	unit.GlobalCooldownEndsAt = now.Add(time.Duration(power.GlobalCooldown * float64(time.Second)))
	if power.Cooldown > 0 {
		if unit.PowerCooldowns == nil {
			unit.PowerCooldowns = make(map[string]time.Time)
		}
		unit.PowerCooldowns[power.Name] = now.Add(time.Duration(power.Cooldown * float64(time.Second)))
	}
}
