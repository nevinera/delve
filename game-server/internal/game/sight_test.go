package game

import (
	"fmt"
	"math"
	"testing"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// walled is level ground where you can't see anything.
type walled struct{ groundOf }

func (walled) Sees(from, to [3]float64) (bool, error) { return false, nil }

func wall() Ground {
	return walled{groundOf(func(x, z float64) (float64, float64) { return 0, math.NaN() })}
}

// behindWall puts the player and the dummy in melee range, facing it, with a wall between them.
func behindWall(t *testing.T) (*Hub, *Player, *float64, *dummy) {
	h, p, c := fighting(t)
	d := p.layer.dummies[0]
	d.state.At = [3]float64{p.state.At[0] + 3*math.Sin(p.state.Yaw), p.state.At[1], p.state.At[2] + 3*math.Cos(p.state.Yaw)}
	p.layer.fakeGround = wall()
	return h, p, c, d
}

func TestSightStopsAbilities(t *testing.T) {
	h, p, _, d := behindWall(t)
	zero := 0.0
	p.fight.class.Abilities = append(p.fight.class.Abilities, combat.Ability{ID: "peek", Name: "Peek", Target: "enemy", GCD: &zero, Range: combat.Distance{Feet: 1000}})
	if _, _, why := p.layer.combat.check(&p.fight.unit, incoming{Ability: "peek", Target: d.ID}, h.now()); why != cantSee {
		t.Fatalf("why = %q", why)
	}
	p.layer.fakeGround = nil
	if _, _, why := p.layer.combat.check(&p.fight.unit, incoming{Ability: "peek", Target: d.ID}, h.now()); why != "" {
		t.Fatalf("with the wall gone, why = %q", why)
	}
}

func TestSightStopsACastLetGo(t *testing.T) {
	h, p, c := fighting(t)
	d := p.layer.dummies[0]
	zero := 0.0
	p.fight.class.Abilities = append(p.fight.class.Abilities, combat.Ability{
		ID: "slowpoke", Name: "Slowpoke", Target: "enemy", GCD: &zero, CastTime: 1, Range: combat.Distance{Feet: 1000},
		Effects: []combat.Effect{{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 5, Max: 5}}},
	})
	use(t, p, "slowpoke")
	p.layer.fakeGround = wall()
	health := d.damage
	pass(h, c, 1.5)
	if d.damage != health {
		t.Fatalf("it hit through the wall: %g to %g", health, d.damage)
	}
	refusal(t, p, cantSee)
}

func TestSightStopsSwings(t *testing.T) {
	h, p, c, d := behindWall(t)
	p.layer.mu.Lock()
	p.layer.combat.startAttacking(&p.fight.unit, d.ID)
	p.layer.mu.Unlock()
	health := d.damage
	pass(h, c, 3)
	if d.damage != health {
		t.Fatalf("it swung through the wall: %g to %g", health, d.damage)
	}
	refusal(t, p, cantSee)
}

func TestSightKeepsEffectAreasOut(t *testing.T) {
	_, p, _, d := behindWall(t)
	p.layer.mu.Lock()
	defer p.layer.mu.Unlock()
	a := effectShape{center: p.state.At, continent: p.state.Continent, affects: "enemies", radius: 1000}
	if got := p.layer.combat.inEffectArea(a); len(got) != 0 {
		t.Fatalf("with the wall up: %d in it", len(got))
	}
	p.layer.fakeGround = nil
	if got := p.layer.combat.inEffectArea(a); len(got) != 1 || got[0].ID != d.ID {
		t.Fatalf("with the wall down: %v", got)
	}
}

func TestAskingWhatTheServerSees(t *testing.T) {
	_, p, _, d := behindWall(t)
	ask(t, p, fmt.Sprintf(`{"type":"sees","target":%d}`, d.ID))
	got := heard(p, "sees")
	if len(got) != 1 || got[0]["clear"] != false || got[0]["target"] != float64(d.ID) {
		t.Fatalf("sees = %v", got)
	}
	for range maxSeesPerSecond * 2 {
		p.layer.answerSees(p, d.ID)
	}
	if got := heard(p, "sees"); len(got) >= maxSeesPerSecond {
		t.Fatalf("answered %d", len(got))
	}
}
