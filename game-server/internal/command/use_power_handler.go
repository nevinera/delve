package command

import (
	"math"
	"math/rand"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

// UsePowerHandler executes a player's resolved power against their current target.
type UsePowerHandler struct{}

func (UsePowerHandler) Type() string      { return "use_power" }
func (UsePowerHandler) Deduplicate() bool { return false }

func (UsePowerHandler) Handle(unitID uuid.UUID, payload CommandPayload, next *instancestate.InstanceState) error {
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
			for diff > 180 { diff -= 360 }
			for diff < -180 { diff += 360 }
			if math.Abs(diff) > 75 {
				return nil
			}
		}
	}

	for _, effect := range p.Power.Effects {
		switch effect.Type {
		case "harm":
			if target == nil {
				continue
			}
			maxRange := 5.0
			if effect.Range != nil {
				maxRange = effect.Range.Max()
			}
			maxRange += unit.Radius + target.Radius
			dx := target.Position.X - unit.Position.X
			dy := target.Position.Y - unit.Position.Y
			if math.Sqrt(dx*dx+dy*dy) > maxRange {
				return nil
			}
			if effect.Amount != nil {
				lo, hi := effect.Amount.Min(), effect.Amount.Max()
				target.Health -= math.Round(lo + rand.Float64()*(hi-lo))
				if target.Health < 0 {
					target.Health = 0
				}
				if target.Health == 0 {
					target.Status = instancestate.UnitStatusDead
					target.Target = nil
				}
			}
		case "heal":
			if effect.Affects == "self" && effect.Amount != nil {
				lo, hi := effect.Amount.Min(), effect.Amount.Max()
				unit.Health += math.Round(lo + rand.Float64()*(hi-lo))
				if unit.Health > unit.MaxHealth {
					unit.Health = unit.MaxHealth
				}
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
