package game

import (
	"encoding/json"
	"math"
	"testing"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

func effects(t *testing.T, text string) []combat.StatusEffect {
	t.Helper()
	var out []combat.StatusEffect
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func strikeOf(n float64) combat.Effect {
	return combat.Effect{Type: "damage", Affects: "target", School: "holy", Amount: combat.Amount{Min: n, Max: n}}
}

// statusFight is a fight with a status for each of these, gained by an ability of its id on
// yourself or `mark<id>` on the dummy, and `hit` for 100 holy damage.
func statusFight(t *testing.T, statuses map[string]string) (*Hub, *Player, *float64) {
	t.Helper()
	h, p, c := fighting(t)
	h.roll = func() float64 { return 0.5 }
	class := p.fight.class
	for id, text := range statuses {
		class.Statuses = append(class.Statuses, combat.Status{ID: id, Name: id, Effects: effects(t, text)})
		class.Abilities = append(class.Abilities, selfBuff(id, gaining(id)), onDummy("mark"+id, combat.Effect{Type: "status", Affects: "target", Status: id}))
	}
	class.Abilities = append(class.Abilities, onDummy("hit", strikeOf(100)), selfBuff("ouch", combat.Effect{Type: "damage", Affects: "self", Amount: combat.Amount{Min: 50, Max: 50}}),
		selfBuff("soothe", combat.Effect{Type: "heal", Affects: "self", Amount: combat.Amount{Min: 10, Max: 10}}))
	return h, p, c
}

func hitFor(t *testing.T, h *Hub, p *Player, c *float64) float64 {
	t.Helper()
	before := p.layer.dummies[0].Health
	h.roll = func() float64 { return 0.5 }
	use(t, p, "hit")
	pass(h, c, 0.5)
	return before - p.layer.dummies[0].Health
}

func TestDamageDoneAndTakenMultiply(t *testing.T) {
	h, p, c := statusFight(t, map[string]string{
		"more":  `[{"type":"stat","stat":"damageDone","multiply":1.5}]`,
		"holy":  `[{"type":"stat","stat":"damageDone","multiply":2,"school":"holy"}]`,
		"frost": `[{"type":"stat","stat":"damageDone","multiply":10,"school":"frost"}]`,
		"frail": `[{"type":"stat","stat":"damageTaken","multiply":1.25}]`,
	})
	if got := hitFor(t, h, p, c); got != 100 {
		t.Fatalf("plain hit = %g", got)
	}
	for _, id := range []string{"more", "holy", "frost"} {
		use(t, p, id)
	}
	use(t, p, "markfrail")
	pass(h, c, 0.5)
	if got := hitFor(t, h, p, c); got != 375 {
		t.Fatalf("hit = %g, want 100 x 1.5 x 2 x 1.25", got)
	}
}

func TestCasterOnlyCountsOnlyThatCaster(t *testing.T) {
	h, p, c := statusFight(t, map[string]string{"cond": `[{"type":"stat","stat":"damageTaken","multiply":2,"casterOnly":true}]`})
	other := enter(t, h, 2)
	pass(h, c, 0.1)
	use(t, other, "markcond")
	pass(h, c, 0.5)
	if got := hitFor(t, h, p, c); got != 100 {
		t.Fatalf("another's Condemned changed my hit: %g", got)
	}
	use(t, p, "markcond")
	pass(h, c, 0.5)
	if got := hitFor(t, h, p, c); got != 200 {
		t.Fatalf("my own Condemned: %g", got)
	}
}

func TestCritStats(t *testing.T) {
	h, p, c := statusFight(t, map[string]string{
		"sharp": `[{"type":"stat","stat":"critChance","add":100},{"type":"stat","stat":"critDamage","add":100}]`,
	})
	use(t, p, "sharp")
	pass(h, c, 0.5)
	if got := hitFor(t, h, p, c); got != 300 {
		t.Fatalf("a sure crit at +100 = %g", got)
	}
}

func TestCritTakenAddsToWhoHitsIt(t *testing.T) {
	h, p, c := statusFight(t, map[string]string{"bare": `[{"type":"stat","stat":"critTaken","add":100}]`})
	use(t, p, "markbare")
	pass(h, c, 0.5)
	if got := hitFor(t, h, p, c); got != 200 {
		t.Fatalf("hit = %g", got)
	}
}

func TestLeechHealsFromDamageDone(t *testing.T) {
	h, p, c := statusFight(t, map[string]string{"sip": `[{"type":"stat","stat":"leech","add":10}]`})
	use(t, p, "sip")
	use(t, p, "ouch")
	pass(h, c, 0.5)
	was := p.fight.vitals.Health
	hitFor(t, h, p, c)
	if got := p.fight.vitals.Health - was; got != 10 {
		t.Fatalf("leeched %g, want 10", got)
	}
}

func TestHealingStats(t *testing.T) {
	h, p, c := statusFight(t, map[string]string{
		"warm": `[{"type":"stat","stat":"healingDone","multiply":2},{"type":"stat","stat":"healingTaken","multiply":0.75}]`,
	})
	use(t, p, "ouch")
	use(t, p, "warm")
	pass(h, c, 0.5)
	was := p.fight.vitals.Health
	use(t, p, "soothe")
	pass(h, c, 0.5)
	if got := p.fight.vitals.Health - was; got != 15 {
		t.Fatalf("healed %g, want 15", got)
	}
}

func TestMaxHealthFollowsStatusesAndKeepsTheShare(t *testing.T) {
	h, p, c := statusFight(t, map[string]string{"big": `[{"type":"stat","stat":"stamina","multiply":2}]`})
	v := &p.fight.vitals
	base := v.MaxHealth
	v.Health = base / 2
	heard(p, "health")
	use(t, p, "big")
	pass(h, c, 0.5)
	if v.MaxHealth != 2*base || math.Abs(v.Health-base) > 0.001 {
		t.Fatalf("health %g / %g, from half of %g", v.Health, v.MaxHealth, base)
	}
	if got := heard(p, "health"); len(got) != 1 || got[0]["maxHealth"] != 2*base {
		t.Fatalf("health messages = %v", got)
	}
	if p.state.MaxHealth != 2*base {
		t.Fatalf("those arriving see %g", p.state.MaxHealth)
	}
	delete(v.Statuses, statusKey{"big", p.ID()})
	pass(h, c, 0.5)
	if v.MaxHealth != base {
		t.Fatalf("it came off and left %g", v.MaxHealth)
	}
}

func TestAttackSpeedShortensSwings(t *testing.T) {
	h, p, c := statusFight(t, map[string]string{"fast": `[{"type":"stat","stat":"attackSpeed","add":100}]`})
	use(t, p, "fast")
	pass(h, c, 0.5)
	p.state.At = p.layer.dummies[0].state.At
	heard(p, "swung")
	if err := p.Handle([]byte(`{"type":"attack","target":-1}`)); err != nil {
		t.Fatal(err)
	}
	pass(h, c, 2.5)
	if got := heard(p, "swung"); len(got) != 3 {
		t.Fatalf("%d swings in 2.5 s at 1 s each", len(got))
	}
}

func TestMovementSpeedReachesTheClientAndTheLimits(t *testing.T) {
	h, p, c := statusFight(t, map[string]string{"slow": `[{"type":"stat","stat":"movementSpeed","multiply":0.5}]`, "gust": `[{"type":"stat","stat":"movementSpeed","multiply":2}]`})
	run := incoming{Move: &Move{Forward: 1}}
	plain := p.motion.speed(run)
	heard(p, "speed")
	use(t, p, "gust")
	pass(h, c, 0.2)
	if got := heard(p, "speed"); len(got) != 1 || got[0]["movementSpeed"] != 200.0 {
		t.Fatalf("speed = %v", got)
	}
	if got := p.motion.speed(run); got != 2*plain {
		t.Fatalf("allowed %g, plain %g", got, plain)
	}
	delete(p.fight.vitals.Statuses, statusKey{"gust", p.ID()})
	pass(h, c, 0.2)
	if got := p.motion.speed(run); got != 2*plain {
		t.Fatalf("it should still allow the old speed till the client hears: %g", got)
	}
	pass(h, c, 3)
	if got := p.motion.speed(run); got != plain {
		t.Fatalf("allowed %g once the client's heard, plain %g", got, plain)
	}
	if !p.motion.settled() {
		t.Fatal("it never settled")
	}
}

func TestAStatsConditionsAreChecked(t *testing.T) {
	h, p, c := statusFight(t, map[string]string{"rally": `[{"type":"stat","stat":"damageDone","multiply":2,"when":[{"health":"self","below":50}]}]`})
	use(t, p, "rally")
	pass(h, c, 0.5)
	if got := hitFor(t, h, p, c); got != 100 {
		t.Fatalf("hit at full health = %g", got)
	}
	p.fight.vitals.Health = 1
	if got := hitFor(t, h, p, c); got != 200 {
		t.Fatalf("hit at low health = %g", got)
	}
}

// Resource stats move the most you can hold, how fast it comes back and what abilities give.
func TestResourceStats(t *testing.T) {
	h, p, c := statusFight(t, map[string]string{
		"vow": `[{"type":"stat","stat":"resourceRegen","resource":"grit","multiply":2},{"type":"stat","stat":"resourceMax","resource":"grit","add":-4},{"type":"stat","stat":"resourceGain","resource":"grit","multiply":3}]`,
	})
	grit := combat.Resource{Key: "grit", Kind: "points", Max: 10, Regen: 1}
	p.fight.class.Resources = append(p.fight.class.Resources, grit)
	p.fight.resources["grit"] = 8
	pass(h, c, 0.1)
	if most := p.fight.pool(grit).Max; most != 10 {
		t.Fatalf("most = %g, want 10", most)
	}
	heard(p)
	use(t, p, "vow")
	pass(h, c, 0.6)
	if have, most := p.fight.resources["grit"], p.fight.pool(grit).Max; have != 6 || most != 6 {
		t.Fatalf("have %g of %g, want 6 of 6", have, most)
	}
	got := heard(p, "resources")
	if len(got) == 0 {
		t.Fatal("no resources message")
	}
	last := got[len(got)-1]
	if last["resources"].(map[string]any)["grit"] != 6.0 || last["max"].(map[string]any)["grit"] != 6.0 {
		t.Fatalf("told %v", last)
	}
	p.fight.resources["grit"] = 1
	was := p.fight.resources["grit"]
	pass(h, c, 1)
	if gained := p.fight.resources["grit"] - was; gained < 1.9 || gained > 2.1 {
		t.Fatalf("gained %g in a second, want about 2", gained)
	}
	p.fight.resources["grit"] = 1
	if given, ok := p.layer.addResource(&p.fight, "grit", 1); !ok || given != 3 || p.fight.resources["grit"] != 4 {
		t.Fatalf("given %g, have %g", given, p.fight.resources["grit"])
	}
	if given, _ := p.layer.addResource(&p.fight, "grit", -1); given != -1 {
		t.Fatalf("resourceGain changed a loss to %g", given)
	}
}

// A stat that asks about a resource doesn't loop, and sees the maximum as it stands.
func TestResourceStatWithAConditionOnAResource(t *testing.T) {
	h, p, c := statusFight(t, map[string]string{
		"vow": `[{"type":"stat","stat":"resourceMax","resource":"grit","add":5,"when":[{"resource":"grit","above":50,"percent":true}]}]`,
	})
	grit := combat.Resource{Key: "grit", Kind: "points", Max: 10}
	p.fight.class.Resources = append(p.fight.class.Resources, grit)
	p.fight.resources["grit"] = 8
	use(t, p, "vow")
	pass(h, c, 0.6)
	if most := p.fight.pool(grit).Max; most != 15 {
		t.Fatalf("most = %g, want 15", most)
	}
}

// Decay waits for combat to end, and a part-earned point doesn't show as a whole one.
func TestDecayAndWholePoints(t *testing.T) {
	h, p, c := statusFight(t, nil)
	grit := combat.Resource{Key: "grit", Kind: "points", Max: 10, Decay: 2}
	p.fight.class.Resources = append(p.fight.class.Resources, grit)
	p.fight.resources["grit"] = 8
	p.fight.since["attack"] = h.now()
	pass(h, c, 1)
	if have := p.fight.resources["grit"]; have != 8 {
		t.Fatalf("in combat: %g, want 8", have)
	}
	pass(h, c, 5)
	if have := p.fight.resources["grit"]; have >= 8 {
		t.Fatalf("out of combat: %g, want less than 8", have)
	}
	if got := shownResource(grit, 2.9); got != 2 {
		t.Fatalf("showed %g, want 2", got)
	}
	if got := shownResource(combat.Resource{Key: "mana", Kind: "mana"}, 2.9); got != 3 {
		t.Fatalf("showed %g, want 3", got)
	}
}

// A class's passives and mastery are held from their levels on, for good, and count as stats.
func TestPassivesAndMastery(t *testing.T) {
	h, p, c := statusFight(t, nil)
	class := *p.fight.class
	class.Statuses = append(class.Statuses[:len(class.Statuses):len(class.Statuses)],
		combat.Status{ID: "second", Effects: effects(t, `[{"type":"stat","stat":"resourceMax","resource":"grit","add":1}]`)},
		combat.Status{ID: "third", Effects: effects(t, `[{"type":"stat","stat":"resourceMax","resource":"grit","add":1}]`)},
		combat.Status{ID: "focus", Effects: effects(t, `[{"type":"stat","stat":"mastery","add":10},{"type":"stat","stat":"damageDone","mastery":1}]`)})
	class.Passives = []combat.Passive{{Status: "second", Level: 10}, {Status: "third", Level: 20}}
	class.Mastery = &combat.Mastery{Status: "focus"}
	grit := combat.Resource{Key: "grit", Kind: "points", Max: 1}
	class.Resources = append(class.Resources[:len(class.Resources):len(class.Resources)], grit)
	p.enterFight(&class, 10)
	pass(h, c, 60)
	if most := p.fight.pool(grit).Max; most != 2 {
		t.Fatalf("most = %g, want 2 at level 10", most)
	}
	if got := hitFor(t, h, p, c); got != 110 {
		t.Fatalf("hit for %g, want 110", got)
	}
	p.enterFight(&class, 20)
	pass(h, c, 0.1)
	if most := p.fight.pool(grit).Max; most != 3 {
		t.Fatalf("most = %g, want 3 at level 20", most)
	}
}
