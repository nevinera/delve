package game

import (
	"math"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

// placed is a mob for a creature placed by hand, where it was placed, at a level from its levels.
func (l *Layer) placed(id int64, p worlds.Placed) *mob {
	c := l.world.Creature(p.Creature)
	level := p.Levels[0] + int(l.combat.roll()*float64(p.Levels[1]-p.Levels[0]+1))
	level = min(level, p.Levels[1])
	health := mobHealth(c, level)
	base := combat.Plain(health)
	base.Level = level
	at := l.onGround(p.Continent, p.At[0], p.At[2])
	made := &mob{
		unit:     unit{ID: id, base: base, Health: health, MaxHealth: health, Statuses: map[statusKey]*activeStatus{}},
		creature: c,
		home:     at,
		state:    Character{ID: id, Name: c.Name, Look: c.Look, Continent: p.Continent, At: at, Yaw: p.Yaw * math.Pi / 180, Move: Move{Gait: "run"}, Level: level, Health: health, MaxHealth: health},
	}
	made.char, made.mob = &made.state, made
	return made
}

// mobHealth is a creature's health at a level: for now, a player's at that level, times the
// creature's own `health`.
func mobHealth(c *worlds.Creature, level int) float64 {
	share := c.Health
	if share <= 0 {
		share = 1
	}
	return math.Round(10 * (10 + 2*float64(level)) * share)
}
