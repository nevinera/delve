package command

import (
	"math"
	"math/rand"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// UsePowerHandler executes a player's resolved power against their current target.
type UsePowerHandler struct{}

func (UsePowerHandler) Type() string      { return "use_power" }
func (UsePowerHandler) Deduplicate() bool { return false }

func (UsePowerHandler) Handle(unitID uuid.UUID, payload CommandPayload, zone instanceconfig.Zone, next *instancestate.InstanceState) error {
	p, ok := payload.(UsePowerPayload)
	if !ok {
		return nil
	}
	unit, ok := next.Units[unitID]
	if !ok || unit.Status == instancestate.UnitStatusDead {
		return nil
	}
	now := time.Now()
	if now.Before(unit.GlobalCooldownEndsAt) {
		return nil
	}
	if p.Power.Cooldown > 0 {
		if cd, ok := unit.PowerCooldowns[p.Power.Name]; ok && now.Before(cd) {
			return nil
		}
	}

	// Only validate and look up the target when at least one effect needs one.
	needsTarget := false
	for _, eff := range p.Power.Effects {
		if eff.Affects != "self" {
			needsTarget = true
			break
		}
	}

	var target *instancestate.UnitState
	if needsTarget {
		if unit.Target == nil {
			return nil
		}
		t, ok := next.Units[*unit.Target]
		if !ok || t.Status == instancestate.UnitStatusDead {
			return nil
		}
		target = t

		if p.Power.IsFrontal() {
			dx := target.Position.X - unit.Position.X
			dy := target.Position.Y - unit.Position.Y
			toTarget := math.Atan2(dx, dy) * 180 / math.Pi
			diff := toTarget - unit.Position.Angle
			for diff > 180 {
				diff -= 360
			}
			for diff < -180 {
				diff += 360
			}
			if math.Abs(diff) > 75 {
				return nil
			}
		}
	}

	timeBudget := PowerEffectTimeBudget(p.Power)
	for _, effect := range p.Power.Effects {
		switch effect.Type {
		case "harm":
			if target == nil {
				continue
			}
			if !inRangeAndLOS(unit, target, zone, effect.Range) {
				return nil
			}
			unit.Attacking = true
			if effect.Amount != nil {
				if target.TaggedBy == nil && target.Hostility != "" {
					target.TaggedBy = &unitID
				}
				EngageOnAttack(target, unitID, zone, next)
				raw := PowerEffectAmount(unit, zone, effect, timeBudget, false, false)
				target.Health -= IncomingDamage(target, zone, raw, effect.School != "magic")
				if target.Health < 0 {
					target.Health = 0
				}
				if target.Health == 0 {
					target.Status = instancestate.UnitStatusDead
					target.Target = nil
					instancestate.RollAndRecordLoot(*unit.Target, target, next)
					unit.Target = nil
					unit.Attacking = false
				}
			}
		case "status":
			if effect.Status == nil {
				continue
			}
			recipient := unit
			if effect.Affects != "self" {
				if target == nil {
					continue
				}
				if !inRangeAndLOS(unit, target, zone, effect.Range) {
					return nil
				}
				recipient = target
				// Casting at a hostile target is an attack too - it aggros
				// an idle hostile target and can be resisted, same as harm.
				// Resistibility is a property of this cast (who it's aimed
				// at), not of the Status itself - see IsHostileAffects.
				EngageOnAttack(target, unitID, zone, next)
				if IsHostileAffects(effect.Affects) && rand.Float64() < baseMissChance {
					continue // resisted
				}
			}
			ApplyStatus(recipient, unit, unitID, *effect.Status, effect.Duration, zone, now)
		case "heal":
			if effect.Amount == nil {
				continue
			}
			recipient := unit
			if effect.Affects != "self" {
				if target == nil {
					continue
				}
				if !inRangeAndLOS(unit, target, zone, effect.Range) {
					return nil
				}
				recipient = target
			}
			recipient.Health += PowerEffectAmount(unit, zone, effect, timeBudget, true, false)
			if recipient.Health > recipient.MaxHealth {
				recipient.Health = recipient.MaxHealth
			}
		}
	}

	unit.GlobalCooldownEndsAt = now.Add(time.Duration(p.Power.GlobalCooldown * float64(time.Second)))
	if p.Power.Cooldown > 0 {
		if unit.PowerCooldowns == nil {
			unit.PowerCooldowns = make(map[string]time.Time)
		}
		unit.PowerCooldowns[p.Power.Name] = now.Add(time.Duration(p.Power.Cooldown * float64(time.Second)))
	}
	return nil
}
