package game

import (
	"context"
	"testing"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

// tacticalWorld has the hostile goblin with three instant abilities, each on a cooldown, and one it
// uses as it dies, by the tactics given.
type tacticalWorld struct {
	tactics string
	order   []string
}

func (w tacticalWorld) Load(ctx context.Context, repo, sha string) (*worlds.World, error) {
	world, _ := fightingWorld{}.Load(ctx, repo, sha)
	goblin := *world.Creatures[0]
	zero := 0.0
	hit := func(id string, n, cooldown float64) combat.Ability {
		return combat.Ability{ID: id, Target: "enemy", GCD: &zero, Range: combat.Distance{Feet: 200}, Cooldown: cooldown, Effects: []combat.Effect{{Type: "damage", Affects: "target", Amount: combat.Amount{Min: n, Max: n}}}}
	}
	burst := combat.Ability{ID: "burs0001", Target: "none", CastTime: 3, Cost: []combat.Cost{{Resource: "rage", Amount: 999}}, Effects: []combat.Effect{{Type: "damage", Affects: "enemies", Around: "self", Radius: 300, Amount: combat.Amount{Min: 7, Max: 7}}}}
	goblin.Kit = &combat.Class{ID: "creatures/gobl0001", Abilities: []combat.Ability{hit("aaaa0001", 1, 60), hit("bbbb0001", 2, 60), hit("cccc0001", 4, 1), burst}}
	goblin.OnDeath = "burs0001"
	goblin.Tactics.Type, goblin.Tactics.Abilities = w.tactics, w.order
	world.Creatures[0] = &goblin
	return world, nil
}

// abilitiesUsed is the abilities a unit was heard using, in order.
func abilitiesUsed(p *Player, id int64) []string {
	var out []string
	for _, u := range heard(p, "used") {
		if u["id"] == float64(id) {
			out = append(out, u["ability"].(string))
		}
	}
	return out
}

func tactical(t *testing.T, w tacticalWorld, seconds float64) (*Player, *mob, *Hub, *float64) {
	people := characters(nil)
	people.class[1] = "frst0001"
	h := NewHub(w, people)
	h.roll = func() float64 { return 0.99 }
	c := clockOf(h)
	p := enter(t, h, 1)
	for i := 0; i < int(seconds/0.05); i++ {
		pass(h, c, 0.05)
	}
	return p, p.layer.mobs[1], h, c
}

func TestPriorityTacticsUseTheFirstReady(t *testing.T) {
	p, mean, _, _ := tactical(t, tacticalWorld{tactics: "priority", order: []string{"bbbb0001", "cccc0001", "aaaa0001"}}, 0.3)
	got := abilitiesUsed(p, mean.ID)
	if len(got) < 3 || got[0] != "bbbb0001" || got[1] != "cccc0001" || got[2] != "aaaa0001" {
		t.Fatalf("used %v", got)
	}
}

func TestRotationTacticsWaitTheirTurn(t *testing.T) {
	p, mean, _, _ := tactical(t, tacticalWorld{tactics: "rotation", order: []string{"cccc0001", "aaaa0001"}}, 2.5)
	got := abilitiesUsed(p, mean.ID)
	// c, a, then c again once it's off cooldown, then waits on a's minute.
	if len(got) != 3 || got[0] != "cccc0001" || got[1] != "aaaa0001" || got[2] != "cccc0001" {
		t.Fatalf("used %v", got)
	}
}

func TestRandomTacticsUseAnyReady(t *testing.T) {
	p, mean, _, _ := tactical(t, tacticalWorld{}, 0.3)
	got := abilitiesUsed(p, mean.ID)
	if len(got) < 3 {
		t.Fatalf("used %v", got)
	}
	for _, id := range got {
		if id == "burs0001" {
			t.Fatal("it used its onDeath ability in the fight")
		}
	}
}

func TestAMobUsesItsOnDeathAbilityAsItDies(t *testing.T) {
	p, mean, h, c := tactical(t, tacticalWorld{tactics: "priority", order: []string{}}, 0.1)
	health := p.fight.unit.Health
	cm := p.layer.combat
	cm.harm(&p.fight.unit, &mean.unit, mean.Health+1, &hit{}, h.now())
	if !mean.char.Dead {
		t.Fatal("it didn't die")
	}
	pass(h, c, 0.05)
	if got := abilitiesUsed(p, mean.ID); len(got) != 1 || got[0] != "burs0001" {
		t.Fatalf("used %v", got)
	}
	if p.fight.unit.Health != health-7 {
		t.Fatalf("health %v, from %v", p.fight.unit.Health, health)
	}
}
