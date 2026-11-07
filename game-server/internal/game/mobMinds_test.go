package game

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

// fightingWorld is fightWorld with a hostile goblin 40 ft north of the spawn point, and a neutral
// one 40 ft south, neither wandering.
type fightingWorld struct{}

func (fightingWorld) Load(ctx context.Context, repo, sha string) (*worlds.World, error) {
	w, _ := fightWorld{}.Load(ctx, repo, sha)
	none := 0.0
	w.Creatures = []*worlds.Creature{
		{ID: "gobl0001", Name: "Goblin", Look: json.RawMessage(`{"body":"goblin"}`), Reaction: "hostile"},
		{ID: "gobl0002", Name: "Calm Goblin", Look: json.RawMessage(`{"body":"goblin"}`), Reaction: "neutral"},
	}
	w.Placed = []worlds.Placed{
		{ID: "mean", Creature: "gobl0001", Continent: "main", At: [3]float64{100, 0, 140}, Levels: worlds.Levels{1, 1}, Wander: &none},
		{ID: "calm", Creature: "gobl0002", Continent: "main", At: [3]float64{100, 0, 60}, Levels: worlds.Levels{1, 1}, Wander: &none},
	}
	return w, nil
}

func TestAHostileMobNoticesChasesAndSwings(t *testing.T) {
	people := characters(nil)
	people.class[1] = "frst0001"
	h := NewHub(fightingWorld{}, people)
	h.roll = func() float64 { return 0.99 } // nothing's avoided
	c := clockOf(h)
	p := enter(t, h, 1)
	l := p.layer
	mean, calm := l.mobs[1], l.mobs[2]
	pass(h, c, 0.1)
	if mean.mind.mode != "fight" || mean.mind.target != p.ID() {
		t.Fatalf("the hostile goblin is %+v", mean.mind)
	}
	if calm.mind.mode != "" {
		t.Fatalf("the neutral goblin is %+v", calm.mind)
	}
	if got := heard(p, "moved"); len(got) == 0 || got[0]["id"] != float64(mean.ID) {
		t.Fatalf("moves heard = %v", got)
	}
	pass(h, c, 2)
	if gap := distance(mean.char.At, p.state.At); gap > combat.MeleeFt {
		t.Fatalf("it's %v ft away after chasing", gap)
	}
	pass(h, c, 2.1)
	if p.fight.unit.Health >= p.fight.unit.MaxHealth {
		t.Fatal("it hasn't hit you")
	}
	swings := heard(p, "swung")
	if len(swings) == 0 || swings[0]["id"] != float64(mean.ID) || swings[0]["target"] != float64(p.ID()) {
		t.Fatalf("swings = %v", swings)
	}

	// Led too far, it gives up, can't be targeted on its way home, and heals there.
	mean.Health = 3
	l.mu.Lock()
	l.teleport(p, "main", [3]float64{100, 0, 400})
	mean.char.At = [3]float64{100, 0, 300}
	l.mu.Unlock()
	pass(h, c, 0.1)
	if mean.mind.mode != "home" || !l.combat.untargetable(&mean.unit, h.now()) {
		t.Fatalf("led away, it's %+v", mean.mind)
	}
	pass(h, c, 10)
	if mean.mind.mode != "" || mean.char.At != mean.home || mean.Health != mean.MaxHealth {
		t.Fatalf("home, it's %+v at %v with %v health", mean.mind, mean.char.At, mean.Health)
	}
}

func TestANeutralMobFightsOnlyOnceHit(t *testing.T) {
	people := characters(nil)
	people.class[1] = "frst0001"
	h := NewHub(fightingWorld{}, people)
	c := clockOf(h)
	p := enter(t, h, 1)
	l := p.layer
	calm := l.mobs[2]
	l.mu.Lock()
	l.mobs[1].mind.mode = "home" // the hostile one's out of the way
	l.combat.harm(&p.fight.unit, &calm.unit, 1, &hit{}, h.now())
	l.mu.Unlock()
	pass(h, c, 0.1)
	if calm.mind.mode != "fight" || calm.mind.target != p.ID() {
		t.Fatalf("hit, the neutral goblin is %+v", calm.mind)
	}
}

func TestAMobAtPeaceWanders(t *testing.T) {
	h := NewHub(fightingWorld{}, characters(nil))
	h.roll = func() float64 { return 0.5 }
	c := clockOf(h)
	p := enter(t, h, 1)
	calm := p.layer.mobs[2]
	far := 20.0
	calm.placing.Wander = &far
	pass(h, c, 20)
	if gap := horizontal(calm.char.At, calm.home); gap < 1 || gap > far {
		t.Fatalf("after wandering it's %v ft from home", gap)
	}
}

func TestAPlayerKilledByAMobWakesAtHome(t *testing.T) {
	people := characters(nil)
	people.class[1] = "frst0001"
	h := NewHub(fightingWorld{}, people)
	h.roll = func() float64 { return 0.99 } // nothing's avoided
	c := clockOf(h)
	p := enter(t, h, 1)
	l := p.layer
	mean := l.mobs[1]
	mean.creature = &worlds.Creature{ID: "gobl0001", Name: "Goblin", Reaction: "hostile", Damage: 1000}
	l.mu.Lock()
	l.teleport(p, "main", [3]float64{100, 0, 130})
	l.mu.Unlock()
	heard(p)
	for i := 0; i < 60 && p.state.At[2] != 100; i++ {
		pass(h, c, 0.05)
	}
	if p.fight.unit.Health != p.fight.unit.MaxHealth || p.state.At[2] != 100 {
		t.Fatalf("after dying: health %v at %v", p.fight.unit.Health, p.state.At)
	}
	if mean.mind.mode != "home" {
		t.Fatalf("the goblin is %+v", mean.mind)
	}
	var said []string
	for _, m := range heard(p, "log") {
		said = append(said, m["text"].(string))
	}
	if len(said) < 2 || said[0] != "You died." {
		t.Fatalf("told %v", said)
	}
}

func TestAggroGrowsAndShrinksWithTheLevelGap(t *testing.T) {
	m := &mob{creature: &worlds.Creature{AggroRadius: 40}}
	m.base.Level = 10
	for _, c := range []struct {
		level int
		want  float64
	}{{10, 40}, {5, 60}, {15, 20}, {40, 10}, {1, 76}} {
		if got := m.aggroRadius(&unit{fight: &fighter{level: c.level}}); got-c.want > 1e-9 || c.want-got > 1e-9 {
			t.Errorf("against level %d: %v, want %v", c.level, got, c.want)
		}
	}
}

func TestAMobWithNoOneNearWaits(t *testing.T) {
	h := NewHub(fightingWorld{}, characters(nil))
	h.roll = func() float64 { return 0.5 }
	c := clockOf(h)
	p := enter(t, h, 1)
	calm := p.layer.mobs[2]
	far := 20.0
	calm.placing.Wander = &far
	p.layer.mu.Lock()
	p.layer.teleport(p, "main", [3]float64{5000, 0, 5000})
	p.layer.mu.Unlock()
	pass(h, c, 20)
	if calm.char.At != calm.home {
		t.Fatalf("it wandered to %v with no one near", calm.char.At)
	}
}
