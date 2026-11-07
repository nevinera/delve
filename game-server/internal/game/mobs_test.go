package game

import (
	"context"
	"encoding/json"
	"math"
	"testing"

	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

// mobWorld is fightWorld with goblins placed: one at level 3 facing +x, and one from 2 to 4.
type mobWorld struct{}

func (mobWorld) Load(ctx context.Context, repo, sha string) (*worlds.World, error) {
	w, _ := fightWorld{}.Load(ctx, repo, sha)
	w.Creatures = []*worlds.Creature{{ID: "gobl0001", Name: "Goblin", Look: json.RawMessage(`{"body":"goblin"}`), Health: 0.5}}
	w.Placed = []worlds.Placed{
		{ID: "p1", Creature: "gobl0001", Continent: "main", At: [3]float64{100, 50, 110}, Yaw: 90, Levels: worlds.Levels{3, 3}},
		{ID: "p2", Creature: "gobl0001", Continent: "far", At: [3]float64{40, 0, 40}, Levels: worlds.Levels{2, 4}},
	}
	return w, nil
}

func TestPlacedCreaturesStandInTheWorld(t *testing.T) {
	people := characters(nil)
	people.class[1] = "frst0001"
	h := NewHub(mobWorld{}, people)
	h.roll = func() float64 { return 0.5 }
	p := enter(t, h, 1)
	next(t, p) // welcome
	found := next(t, p)["characters"].([]any)
	if len(found) != 2 {
		t.Fatalf("seen = %v", found)
	}
	g := found[1].(map[string]any)
	if g["name"] != "Goblin" || g["level"] != 3.0 || g["dummy"] != nil || g["health"] != 80.0 || g["maxHealth"] != 80.0 || g["look"].(map[string]any)["body"] != "goblin" {
		t.Fatalf("goblin = %v", g)
	}
	if at := g["at"].([]any); at[0] != 100.0 || at[2] != 110.0 || math.Abs(g["yaw"].(float64)-math.Pi/2) > 1e-9 {
		t.Fatalf("goblin at %v facing %v", at, g["yaw"])
	}
	far := p.layer.mobs[2]
	if far.char.Level != 3 || far.char.Continent != "far" || far.training {
		t.Fatalf("the far goblin = %+v", far.char)
	}

	// It takes damage, but can't die yet.
	gob := p.layer.mobs[1]
	p.layer.mu.Lock()
	p.layer.combat.harm(&p.fight.unit, &gob.unit, 1000, &hit{}, h.now())
	p.layer.mu.Unlock()
	if gob.Health != 1 || gob.damage != 0 {
		t.Fatalf("health %v, tally %v", gob.Health, gob.damage)
	}
}

func TestTheFixturesGoblinsStandOnTheGround(t *testing.T) {
	h := NewHub(plateWorld(t), characters(nil))
	p := enter(t, h, 1)
	next(t, p)
	found := next(t, p)["characters"].([]any)
	if len(found) != 3 {
		t.Fatalf("seen = %v", found)
	}
	g := p.layer.ground("main")
	for _, m := range p.layer.mobs {
		s, ok, err := g.At(m.char.At[0], m.char.At[2])
		if !ok || err != nil || m.char.At[1] != s.Ground || m.char.At[1] == 0 || m.char.Name != "Goblin" {
			t.Fatalf("%s at %v, ground %v", m.char.Name, m.char.At, s.Ground)
		}
	}
}
