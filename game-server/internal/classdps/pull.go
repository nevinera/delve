package classdps

import (
	"math/rand"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// enemyAttackInterval is how often each reference enemy swings. The doc
// gives attack intervals as "mostly 0.5s-2.5s"; 1.5s is the middle.
const enemyAttackInterval = 1.5

// enemyUnit is one member of a reference pull: its health, the raw damage
// per second it deals before the target's mitigation and avoidance, and
// the school of its attacks.
type enemyUnit struct {
	HP       float64
	RawDPS   float64
	Physical bool
}

// pull is a group of enemies fought together. Immortal units never lose
// health (the time-to-die run, where the question is how long the
// character lasts, not how fast it wins).
type pull struct {
	Units    []enemyUnit
	Immortal bool
}

type enemyState struct {
	id           uuid.UUID
	unit         *instancestate.UnitState
	spec         enemyUnit
	nextAttackAt float64
}

const immortalHealth = 1e12

// newEnemies builds the pull's UnitStates, with attack phases spread across
// one interval so the hits don't all land on the same tick.
func newEnemies(p *pull) []*enemyState {
	if p == nil {
		return nil
	}
	enemies := make([]*enemyState, len(p.Units))
	for i, spec := range p.Units {
		u := newTargetDummy()
		hp := spec.HP
		if p.Immortal {
			hp = immortalHealth
		}
		u.Health, u.MaxHealth = hp, hp
		enemies[i] = &enemyState{
			id:           uuid.New(),
			unit:         u,
			spec:         spec,
			nextAttackAt: enemyAttackInterval * float64(i) / float64(len(p.Units)),
		}
	}
	return enemies
}

// attackFromPull lets every living enemy whose swing is due hit the
// character, through the real avoidance and mitigation math.
func attackFromPull(enemies []*enemyState, unit *instancestate.UnitState, zone instanceconfig.Zone, now float64, p *pull, rng *rand.Rand) {
	for _, e := range enemies {
		if e.unit.Health <= 0 || now < e.nextAttackAt {
			continue
		}
		e.nextAttackAt += enemyAttackInterval
		raw := e.spec.RawDPS * enemyAttackInterval
		dealt := command.IncomingDamage(unit, zone, raw, e.spec.Physical, rng)
		unit.Health -= dealt
		if dealt > 0 {
			unit.DamageTakenThisTick = true
			e.unit.DamageDealtThisTick = true
		}
	}
}
