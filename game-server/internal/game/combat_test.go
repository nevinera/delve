package game

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

// A world with a dummy 20 ft north of (+z from) the spawn point, and one class.
type fightWorld struct{}

func (fightWorld) Load(_ context.Context, repo, sha string) (*worlds.World, error) {
	yes := true
	zero := 0.0
	return &worlds.World{
		Repo: repo, Sha: sha, Continents: []string{"main"},
		Spawn:   worlds.Spawn{Continent: "main", At: [2]float64{100, 100}},
		Dummies: []worlds.Dummy{{Continent: "main", At: [2]float64{100, 120}}},
		Classes: []*combat.Class{{
			ID: "frst0001", Name: "Frost", PrimaryStats: []string{"intellect"},
			Resources: []combat.Resource{{Key: "mana", Kind: "mana"}},
			Statuses:  []combat.Status{{ID: "chill001", Name: "Chilled", Duration: 3}},
			Abilities: []combat.Ability{
				{ID: "zap", Target: "enemy", Range: combat.Distance{Feet: 30}, Cost: []combat.Cost{{Resource: "mana", Amount: 100}}, Effects: []combat.Effect{{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 10, Max: 10}}}},
				{ID: "jab", Target: "enemy", Range: combat.Distance{Melee: true}, Effects: []combat.Effect{{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 1, Max: 1}}}},
				{ID: "bolt", Target: "enemy", Range: combat.Distance{Feet: 30}, CastTime: 2, Speed: 20, Cooldown: 8, Effects: []combat.Effect{
					{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 5, Max: 5}},
					{Type: "status", Affects: "target", Status: "chill001"},
				}},
				{ID: "drain", Target: "enemy", Range: combat.Distance{Feet: 30}, Channel: &combat.Channel{Duration: 3, Ticks: 3}, Effects: []combat.Effect{{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 2, Max: 2}}}},
				{ID: "siphon", Target: "enemy", Range: combat.Distance{Feet: 30}, CastTime: 1, Channel: &combat.Channel{Duration: 2, Ticks: 2}, Effects: []combat.Effect{{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 2, Max: 2}}}},
				{ID: "mend", Target: "ally", GCD: &zero, Facing: &yes, Effects: []combat.Effect{{Type: "heal", Affects: "target", Amount: combat.Amount{Min: 9, Max: 9}}}},
				{ID: "nova", Target: "none", Effects: []combat.Effect{{Type: "damage", Affects: "enemies", Around: "self", Radius: 25, Amount: combat.Amount{Min: 7, Max: 7}}}},
				{ID: "far", Target: "none", Effects: []combat.Effect{{Type: "damage", Affects: "enemies", Around: "self", Radius: 10, Amount: combat.Amount{Min: 7, Max: 7}}}},
			},
		}},
	}, nil
}

// fighting enters a character facing the dummy, ready to fight.
func fighting(t *testing.T) (*Hub, *Player, *float64) {
	t.Helper()
	h := NewHub(fightWorld{}, characters(nil))
	h.roll = func() float64 { return 0.5 } // never a crit
	c := clockOf(h)
	p := enter(t, h, 1)
	if w := next(t, p); w["type"] != "welcome" || w["you"].(map[string]any)["class"] != "frst0001" {
		t.Fatalf("welcome = %v", w)
	}
	s := next(t, p)
	found := s["characters"].([]any)
	if len(found) != 1 || found[0].(map[string]any)["dummy"] != true {
		t.Fatalf("snapshot = %v", s)
	}
	h.Tick()
	return h, p, c
}

func use(t *testing.T, p *Player, ability string) {
	t.Helper()
	if err := p.Handle([]byte(fmt.Sprintf(`{"type":"use","ability":%q,"target":-1}`, ability))); err != nil {
		t.Fatal(err)
	}
}

// pass moves the clock on and combat with it, in small steps.
func pass(h *Hub, c *float64, s float64) {
	for ; s > 0; s -= 0.05 {
		*c += 0.05
		h.Tick()
	}
}

// heard is what's waiting for p, keeping the types asked for.
func heard(p *Player, types ...string) []map[string]any {
	var out []map[string]any
	for {
		select {
		case <-p.Gone:
			return out
		default:
		}
		select {
		case b := <-p.Send:
			m := map[string]any{}
			_ = jsonInto(b, &m)
			for _, want := range types {
				if m["type"] == want {
					out = append(out, m)
				}
			}
		default:
			return out
		}
	}
}

func refusal(t *testing.T, p *Player, why string) {
	t.Helper()
	got := heard(p, "refused")
	if len(got) != 1 || got[0]["why"] != why {
		t.Fatalf("refusals = %v, want %q", got, why)
	}
}

func TestAnInstantAbilityHitsTheDummyAndCostsMana(t *testing.T) {
	h, p, c := fighting(t)
	use(t, p, "zap")
	if got := heard(p, "used"); len(got) != 1 || got[0]["gcd"] != 1.5 {
		t.Fatalf("used = %v", got)
	}
	pass(h, c, 0.6)
	hits := heard(p, "hit")
	if len(hits) != 1 || hits[0]["amount"] != 10.0 || hits[0]["on"] != -1.0 || hits[0]["health"] != dummyHealth-10 || hits[0]["dps"] != 10.0 {
		t.Fatalf("hits = %v", hits)
	}
	if p.fight.resources["mana"] > 900+20 {
		t.Fatalf("mana = %v", p.fight.resources["mana"])
	}
}

func TestTheGlobalCooldownAndNoCooldownAtZero(t *testing.T) {
	h, p, c := fighting(t)
	use(t, p, "zap")
	heard(p, "used")
	use(t, p, "zap")
	refusal(t, p, "not ready yet")
	use(t, p, "mend") // gcd 0 and facing the spot it stands on
	if got := heard(p, "used"); len(got) != 1 {
		t.Fatalf("off the gcd: %v", got)
	}
	pass(h, c, 1.5)
	heard(p, "hit")
	use(t, p, "zap")
	if got := heard(p, "used"); len(got) != 1 {
		t.Fatalf("after the gcd: %v", got)
	}
}

func TestRangeAndFacingAndTargets(t *testing.T) {
	_, p, _ := fighting(t)
	use(t, p, "jab")
	refusal(t, p, "out of range")
	p.state.Yaw = 3.14 // turned away
	use(t, p, "zap")
	refusal(t, p, "you're not facing it")
	p.state.Yaw = 0
	if err := p.Handle([]byte(`{"type":"use","ability":"zap"}`)); err != nil {
		t.Fatal(err)
	}
	refusal(t, p, "you need an enemy targeted")
	use(t, p, "nothing")
	refusal(t, p, "you don't know that")
}

func TestACastLandsAfterItsTimeAndFlightAndCoolsDown(t *testing.T) {
	h, p, c := fighting(t)
	use(t, p, "bolt")
	pass(h, c, 1.9)
	if got := heard(p, "hit", "cooldown"); len(got) != 0 {
		t.Fatalf("early: %v", got)
	}
	pass(h, c, 0.2) // let go at 2 s: the cooldown starts, the bolt's still flying 1 s
	if got := heard(p, "hit", "cooldown"); len(got) != 1 || got[0]["type"] != "cooldown" {
		t.Fatalf("let go: %v", got)
	}
	pass(h, c, 1.0)
	hits := heard(p, "hit")
	if len(hits) != 2 || hits[0]["amount"] != 5.0 || hits[1]["status"] != "chill001" || hits[1]["lasts"] != 3.0 {
		t.Fatalf("hits = %v", hits)
	}
	use(t, p, "bolt")
	refusal(t, p, "not ready yet")
	pass(h, c, 8)
	use(t, p, "bolt")
	if got := heard(p, "used"); len(got) != 1 {
		t.Fatalf("after the cooldown: %v", got)
	}
}

func TestMovingStopsACast(t *testing.T) {
	h, p, c := fighting(t)
	use(t, p, "bolt")
	heard(p, "used")
	move(t, p, 100, 101)
	if got := heard(p, "stopped"); len(got) != 1 {
		t.Fatalf("stopped = %v", got)
	}
	pass(h, c, 4)
	if got := heard(p, "hit", "cooldown"); len(got) != 0 {
		t.Fatalf("landed anyway: %v", got)
	}
	use(t, p, "bolt") // still walking
	refusal(t, p, "you can't do that while moving")
}

func TestAChannelTicksAndStops(t *testing.T) {
	h, p, c := fighting(t)
	use(t, p, "drain")
	pass(h, c, 2.1)
	if got := heard(p, "hit"); len(got) != 2 {
		t.Fatalf("hits = %v", got)
	}
	if err := p.Handle([]byte(`{"type":"stop"}`)); err != nil {
		t.Fatal(err)
	}
	pass(h, c, 2)
	if got := heard(p, "hit"); len(got) != 0 {
		t.Fatalf("after stopping: %v", got)
	}
}

func TestAChannelWithACastTimeTicksAfterItAndThenEnds(t *testing.T) {
	h, p, c := fighting(t)
	use(t, p, "siphon")
	pass(h, c, 0.9)
	if got := heard(p, "hit"); len(got) != 0 {
		t.Fatalf("during the cast: %v", got)
	}
	pass(h, c, 2.2)
	if got := heard(p, "hit"); len(got) != 2 {
		t.Fatalf("hits = %v", got)
	}
	if p.fight.cast != nil {
		t.Fatal("still channelling")
	}
}

func TestAreasReachWhoTheyReach(t *testing.T) {
	h, p, c := fighting(t)
	use(t, p, "far")
	pass(h, c, 1.6)
	if got := heard(p, "hit"); len(got) != 0 {
		t.Fatalf("too far: %v", got)
	}
	use(t, p, "nova")
	pass(h, c, 0.1)
	if got := heard(p, "hit"); len(got) != 1 || got[0]["amount"] != 7.0 {
		t.Fatalf("hits = %v", got)
	}
}

func TestADummyNeverDiesAndResets(t *testing.T) {
	h, p, c := fighting(t)
	d := p.layer.dummies[0]
	d.Health = 3
	use(t, p, "nova")
	pass(h, c, 0.1)
	if d.Health != 1 {
		t.Fatalf("health = %v", d.Health)
	}
	pass(h, c, dummyResetIdle.Seconds()+0.1)
	if got := heard(p, "health"); len(got) != 1 || got[0]["health"] != dummyHealth || d.damage != 0 {
		t.Fatalf("health = %v, tally %v", got, d.damage)
	}
}

func TestOthersNearSeeAbilities(t *testing.T) {
	h, p, c := fighting(t)
	o := enter(t, h, 2)
	use(t, p, "nova")
	pass(h, c, 0.1)
	if got := heard(o, "used", "hit"); len(got) != 2 {
		t.Fatalf("heard = %v", got)
	}
}

func TestLeavingDropsWhatWasComing(t *testing.T) {
	h, p, c := fighting(t)
	use(t, p, "bolt")
	h.Leave(p)
	pass(h, c, 5) // nothing to crash on
}

func jsonInto(b []byte, m *map[string]any) error { return json.Unmarshal(b, m) }
