package game

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

// castingWorld is fightingWorld with the hostile goblin a shaman: it throws a bolt with a cast time
// from range, on a cooldown, and nova round itself, an effect area that hits players.
type castingWorld struct{}

func (castingWorld) Load(ctx context.Context, repo, sha string) (*worlds.World, error) {
	w, _ := fightingWorld{}.Load(ctx, repo, sha)
	shaman := *w.Creatures[0]
	shaman.Kit = &combat.Class{ID: "creatures/gobl0001", Statuses: []combat.Status{{ID: "sear0001", Name: "Seared", Duration: 5}}, Abilities: []combat.Ability{
		{ID: "bolt0001", Target: "enemy", Range: combat.Distance{Feet: 80}, CastTime: 1, Cooldown: 6, Effects: []combat.Effect{
			{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 5, Max: 5}},
			{Type: "status", Affects: "target", Status: "sear0001"},
		}},
	}}
	w.Creatures[0] = &shaman
	return w, nil
}

func TestAMobCastsItsAbilitiesAtWhoItFights(t *testing.T) {
	people := characters(nil)
	people.class[1] = "frst0001"
	h := NewHub(castingWorld{}, people)
	h.roll = func() float64 { return 0.99 }
	c := clockOf(h)
	p := enter(t, h, 1)
	mean := p.layer.mobs[1]
	pass(h, c, 0.1)
	if mean.mind.mode != "fight" || mean.fight == nil || mean.fight.cast == nil {
		t.Fatalf("the shaman isn't casting: %+v", mean.mind)
	}
	used := heard(p, "used")
	if len(used) == 0 || used[0]["id"] != float64(mean.ID) || used[0]["class"] != "creatures/gobl0001" || used[0]["ability"] != "bolt0001" {
		t.Fatalf("used = %v", used)
	}
	at := mean.char.At
	pass(h, c, 0.5)
	if mean.char.At != at {
		t.Fatal("it moved while casting")
	}
	health := p.fight.unit.Health
	pass(h, c, 1)
	if p.fight.unit.Health != health-5 {
		t.Fatalf("health %v, from %v", p.fight.unit.Health, health)
	}
	if p.fight.unit.Statuses[statusKey{"sear0001", mean.ID}] == nil {
		t.Fatal("its status isn't on you")
	}
	// On its cooldown, it closes in and swings.
	pass(h, c, 2)
	if mean.fight.cast != nil || distance(mean.char.At, p.state.At) > combat.MeleeFt+0.5 {
		t.Fatalf("it's %v ft off, casting %v", distance(mean.char.At, p.state.At), mean.fight.cast)
	}
}

func TestACreaturesKitIsItsAbilitiesFromTheWorld(t *testing.T) {
	var c worlds.Creature
	if err := json.Unmarshal([]byte(`{"id":"gobl0001","abilities":["bolt0001",{"id":"stab0001"}]}`), &c); err != nil {
		t.Fatal(err)
	}
	if len(c.Abilities) != 2 || c.Abilities[0].ID != "bolt0001" || c.Abilities[1].ID != "stab0001" {
		t.Fatalf("abilities = %+v", c.Abilities)
	}
}
