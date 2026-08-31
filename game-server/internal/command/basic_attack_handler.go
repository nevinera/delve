package command

import (
	"math"
	"math/rand"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

// characterBasicAttackRange, characterBasicAttackInterval, and the damage
// bounds are flat placeholders: every character basic-attacks at the same
// range/speed/damage regardless of class or equipped weapon. Weapon-driven
// values are a later step.
const (
	characterBasicAttackRange    = 5.0
	characterBasicAttackInterval = 2 * time.Second
	characterBasicAttackDamageLo = 1.0
	characterBasicAttackDamageHi = 3.0
)

// BasicAttackHandler executes one swing of a player unit's basic attack
// against its current target, gated by the swing timer.
type BasicAttackHandler struct{}

func (BasicAttackHandler) Type() string      { return "basic_attack" }
func (BasicAttackHandler) Deduplicate() bool { return false }

func (BasicAttackHandler) Handle(unitID uuid.UUID, payload CommandPayload, next *instancestate.InstanceState) error {
	if _, ok := payload.(BasicAttackPayload); !ok {
		return nil
	}
	unit, ok := next.Units[unitID]
	if !ok || unit.Status == instancestate.UnitStatusDead {
		return nil
	}
	if !unit.Attacking || unit.Target == nil {
		return nil
	}
	now := time.Now()
	if now.Before(unit.NextBasicAttackAt) {
		return nil
	}

	target, ok := next.Units[*unit.Target]
	if !ok || target.Status == instancestate.UnitStatusDead {
		return nil
	}

	dx := target.Position.X - unit.Position.X
	dy := target.Position.Y - unit.Position.Y
	if math.Sqrt(dx*dx+dy*dy) > characterBasicAttackRange+unit.Radius+target.Radius {
		return nil
	}

	unit.NextBasicAttackAt = now.Add(characterBasicAttackInterval)

	if target.TaggedBy == nil && target.Hostility != "" {
		target.TaggedBy = &unitID
	}
	lo, hi := characterBasicAttackDamageLo, characterBasicAttackDamageHi
	target.Health -= math.Round(lo + rand.Float64()*(hi-lo))
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
	return nil
}
