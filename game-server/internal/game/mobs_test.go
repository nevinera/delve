package game

import (
	"context"
	"encoding/json"
	"math"
	"slices"
	"testing"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
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

	// At no health it dies, can't be targeted, and comes back where it was after its respawn time.
	c := clockOf(h)
	gob := p.layer.mobs[1]
	gob.placing.Respawn = 30
	heard(p)
	p.layer.mu.Lock()
	p.layer.combat.harm(&p.fight.unit, &gob.unit, 1000, &hit{}, h.now())
	dead := p.layer.combat.untargetable(&gob.unit, h.now())
	p.layer.mu.Unlock()
	if gob.Health != 0 || !gob.char.Dead || !dead || gob.damage != 0 {
		t.Fatalf("health %v, dead %v, untargetable %v, tally %v", gob.Health, gob.char.Dead, dead, gob.damage)
	}
	if got := heard(p, "died"); len(got) != 1 || got[0]["id"] != float64(gob.ID) {
		t.Fatalf("died = %v", got)
	}
	// What was on its way when it died doesn't land on the body.
	p.layer.mu.Lock()
	p.layer.combat.land(&p.fight.unit, &casting{ability: &combat.Ability{ID: "zap"}}, &combat.Effect{Type: "damage", Amount: combat.Amount{Min: 5, Max: 5}}, &gob.unit, 1, h.now())
	p.layer.mu.Unlock()
	if got := heard(p, "hit"); len(got) != 0 || gob.Health != 0 {
		t.Fatalf("hits on the body = %v, health %v", got, gob.Health)
	}
	gob.char.At[0] = 500 // where it fell
	pass(h, c, 29)
	if !p.layer.mobs[1].char.Dead {
		t.Fatal("came back early")
	}
	pass(h, c, 1.1)
	back := p.layer.mobs[1]
	if back.char.Dead || back.Health != 80 || back.char.At[0] != 100 || back.char.Level != 3 {
		t.Fatalf("came back as %+v, health %v", back.char, back.Health)
	}
	if got := heard(p, "appear"); len(got) != 1 || got[0]["character"].(map[string]any)["dead"] != nil {
		t.Fatalf("appear = %v", got)
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

// nearWorld is fightWorld with a goblin by the spawn point and another 2000 ft east.
type nearWorld struct{}

func (nearWorld) Load(ctx context.Context, repo, sha string) (*worlds.World, error) {
	w, _ := fightWorld{}.Load(ctx, repo, sha)
	w.Creatures = []*worlds.Creature{{ID: "gobl0001", Name: "Goblin", Look: json.RawMessage(`{"body":"goblin"}`)}}
	w.Placed = []worlds.Placed{
		{ID: "near", Creature: "gobl0001", Continent: "main", At: [3]float64{110, 0, 100}, Levels: worlds.Levels{1, 1}, Respawn: 10},
		{ID: "far", Creature: "gobl0001", Continent: "main", At: [3]float64{2100, 0, 100}, Levels: worlds.Levels{1, 1}},
	}
	return w, nil
}

func ids(characters []any) []float64 {
	var out []float64
	for _, c := range characters {
		out = append(out, c.(map[string]any)["id"].(float64))
	}
	return out
}

func TestMobsAreSeenOnlyByThoseNearThem(t *testing.T) {
	h := NewHub(nearWorld{}, characters(nil))
	c := clockOf(h)
	here := enter(t, h, 1)
	next(t, here)
	if got := ids(next(t, here)["characters"].([]any)); !slices.Equal(got, []float64{-1, -2}) {
		t.Fatalf("snapshot by the spawn point = %v, want the dummy and the near goblin", got)
	}
	far := enter(t, h, 2)
	l := here.layer
	heard(far)
	l.mu.Lock()
	l.teleport(far, "main", [3]float64{2100, 0, 120})
	l.mu.Unlock()
	var appeared, vanished []float64
	for _, m := range heard(far, "appear", "vanish") {
		if m["type"] == "appear" {
			appeared = append(appeared, m["character"].(map[string]any)["id"].(float64))
		} else {
			vanished = append(vanished, m["id"].(float64))
		}
	}
	slices.Sort(vanished)
	if !slices.Equal(appeared, []float64{-3}) || !slices.Equal(vanished, []float64{-2, -1, 1}) {
		t.Fatalf("going east, saw %v come and %v go", appeared, vanished)
	}

	// The near goblin dies: only those near it hear, and it comes back where it was placed.
	near := l.mobs[1]
	heard(here)
	l.mu.Lock()
	l.combat.harm(&here.fight.unit, &near.unit, 1e6, &hit{}, h.now())
	l.mu.Unlock()
	if len(heard(here, "died")) != 1 || len(heard(far, "died")) != 0 {
		t.Fatal("died went to the wrong players")
	}
	// Moved while dead, its body is out of here's sight but in far's, and coming back swaps them.
	near.state.At = [3]float64{2100, 0, 140}
	pass(h, c, 10.1)
	if got := heard(here, "appear"); len(got) != 1 || got[0]["character"].(map[string]any)["id"] != -2.0 {
		t.Fatalf("here heard %v", got)
	}
	if got := heard(far, "vanish"); len(got) != 1 || got[0]["id"] != -2.0 {
		t.Fatalf("far heard %v", got)
	}
}
