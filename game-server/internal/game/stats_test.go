package game

import (
	"encoding/json"
	"fmt"
	"math"
	"slices"
	"strings"
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
	before := p.layer.mobs[0].damage
	h.roll = func() float64 { return 0.5 }
	use(t, p, "hit")
	pass(h, c, 0.5)
	return math.Round((p.layer.mobs[0].damage-before)*1e6) / 1e6 // to a millionth, past float error
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
	was := p.fight.unit.Health
	hitFor(t, h, p, c)
	if got := p.fight.unit.Health - was; got != 10 {
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
	was := p.fight.unit.Health
	use(t, p, "soothe")
	pass(h, c, 0.5)
	if got := p.fight.unit.Health - was; got != 15 {
		t.Fatalf("healed %g, want 15", got)
	}
}

func TestMaxHealthFollowsStatusesAndKeepsTheShare(t *testing.T) {
	h, p, c := statusFight(t, map[string]string{"big": `[{"type":"stat","stat":"stamina","multiply":2}]`})
	v := &p.fight.unit
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
	p.state.At = p.layer.mobs[0].state.At
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
	delete(p.fight.unit.Statuses, statusKey{"gust", p.ID()})
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
	p.fight.unit.Health = 1
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
	if given, ok := p.layer.combat.addResource(&p.fight, "grit", 1); !ok || given != 3 || p.fight.resources["grit"] != 4 {
		t.Fatalf("given %g, have %g", given, p.fight.resources["grit"])
	}
	if given, _ := p.layer.combat.addResource(&p.fight, "grit", -1); given != -1 {
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
	p.enterFight(&class, 10, combat.Build{})
	pass(h, c, 60)
	if most := p.fight.pool(grit).Max; most != 2 {
		t.Fatalf("most = %g, want 2 at level 10", most)
	}
	if got := hitFor(t, h, p, c); got != 110 {
		t.Fatalf("hit for %g, want 110", got)
	}
	p.enterFight(&class, 20, combat.Build{})
	pass(h, c, 0.1)
	if most := p.fight.pool(grit).Max; most != 3 {
		t.Fatalf("most = %g, want 3 at level 20", most)
	}
}

// What you hold changes what your abilities cost and do, and the server says so as you use them.
func TestModifyChangesAbilities(t *testing.T) {
	h, p, c := statusFight(t, map[string]string{
		"zeal":  `[{"type":"modify","abilities":["hit"],"change":"damage","multiply":2},{"type":"modify","abilities":["hit"],"change":"cost","add":3},{"type":"modify","abilities":["hit"],"change":"cooldown","add":5},{"type":"modify","abilities":["hit"],"change":"castTime","add":1},{"type":"modify","abilities":["hit"],"change":"critChance","add":100}]`,
		"steep": `[{"type":"modify","abilities":["hit"],"change":"cost","add":1000}]`,
	})
	p.fight.class.Resources = append(p.fight.class.Resources, combat.Resource{Key: "grit", Kind: "points", Max: 10})
	p.fight.resources["grit"] = 5
	for i := range p.fight.class.Abilities {
		if a := &p.fight.class.Abilities[i]; a.ID == "hit" {
			a.Cost = []combat.Cost{{Resource: "grit", Amount: 1}}
		}
	}
	use(t, p, "zeal")
	pass(h, c, 2)
	heard(p)
	before := p.layer.mobs[0].damage
	use(t, p, "hit")
	got := heard(p, "used", "cooldown")
	if len(got) != 1 || got[0]["castTime"] != 1.0 {
		t.Fatalf("heard %v", got)
	}
	pass(h, c, 1.5)
	if have := p.fight.resources["grit"]; have != 1 {
		t.Fatalf("grit = %g, want 1 after spending 4", have)
	}
	if hurt := p.layer.mobs[0].damage - before; hurt != 400 {
		t.Fatalf("hit for %g, want 100 x 2 x a crit", hurt)
	}
	if got := heard(p, "cooldown"); len(got) != 1 || got[0]["seconds"] != 5.0 {
		t.Fatalf("cooldown %v", got)
	}
	if base := p.fight.class.Ability("hit"); base.CastTime != 0 || base.Cost[0].Amount != 1 {
		t.Fatalf("changed the class's ability: %+v", base)
	}
	pass(h, c, 6)
	use(t, p, "steep")
	pass(h, c, 2)
	heard(p)
	use(t, p, "hit")
	if got := heard(p, "refused"); len(got) != 1 {
		t.Fatalf("not refused: %v", got)
	}
}

// A modify of statuses changes how long the statuses you apply last.
func TestModifyChangesStatuses(t *testing.T) {
	h, p, c := statusFight(t, map[string]string{
		"long": `[{"type":"modify","statuses":["brand"],"change":"duration","add":4}]`,
	})
	p.fight.class.Statuses = append(p.fight.class.Statuses, combat.Status{ID: "brand", Name: "Brand", Duration: 2})
	p.fight.class.Abilities = append(p.fight.class.Abilities, selfBuff("brand", gaining("brand")))
	use(t, p, "long")
	pass(h, c, 2)
	heard(p)
	use(t, p, "brand")
	pass(h, c, 0.1)
	if got := heard(p, "hit"); got[len(got)-1]["lasts"] != 6.0 {
		t.Fatalf("lasts %v", got[len(got)-1])
	}
}

// A modify can let an ability past its cooldown and requires, add to what it does and change its school.
func TestModifyChangesWhatAbilitiesAre(t *testing.T) {
	h, p, c := statusFight(t, map[string]string{
		"free": `[{"type":"modify","abilities":["hit"],"ignores":["cooldown","requires"]}]`,
		"more": `[{"type":"modify","abilities":["hit"],"overrides":{"school":"frost"},"addEffects":[{"type":"damage","affects":"target","amount":7}]}]`,
	})
	gone := combat.Condition{Status: "never", On: "self"}
	for i := range p.fight.class.Abilities {
		if a := &p.fight.class.Abilities[i]; a.ID == "hit" {
			a.Cooldown, a.Requires = 100, []combat.Condition{gone}
		}
	}
	heard(p)
	use(t, p, "hit")
	if got := heard(p, "refused"); len(got) != 1 {
		t.Fatalf("not refused: %v", got)
	}
	use(t, p, "free")
	pass(h, c, 0.1)
	if got := hitFor(t, h, p, c); got != 100 {
		t.Fatalf("hit for %g", got)
	}
	if got := hitFor(t, h, p, c); got != 100 {
		t.Fatalf("second hit, through the cooldown, for %g", got)
	}
	use(t, p, "more")
	pass(h, c, 0.1)
	heard(p)
	if got := hitFor(t, h, p, c); got != 107 {
		t.Fatalf("hit for %g, want 100 and the added 7", got)
	}
	used := heard(p, "used")
	if len(used) != 1 || used[0]["school"] != "frost" {
		t.Fatalf("used %v", used)
	}
}

// A periodic effect ticks while held, from the one who applied it, and its stats and stacks count.
func TestPeriodicTicks(t *testing.T) {
	h, p, c := statusFight(t, nil)
	class := p.fight.class
	class.Statuses = append(class.Statuses,
		combat.Status{ID: "bleed", Name: "Bleed", Duration: 6, Stacking: "stack", Effects: effects(t, `[{"type":"periodic","every":2,"does":"damage","amount":10,"school":"physical","category":"bleed","drain":0.5}]`)},
		combat.Status{ID: "more", Name: "More", Effects: effects(t, `[{"type":"stat","stat":"damageDone","multiply":2,"statuses":["bleed"]}]`)},
		combat.Status{ID: "quick", Name: "Quick", Effects: effects(t, `[{"type":"modify","statuses":["bleed"],"change":"tickRate","multiply":2}]`)})
	class.Abilities = append(class.Abilities, onDummy("cut", combat.Effect{Type: "status", Affects: "target", Status: "bleed"}), selfBuff("more", gaining("more")), selfBuff("quick", gaining("quick")),
		selfBuff("ouch2", combat.Effect{Type: "damage", Affects: "self", Amount: combat.Amount{Min: 50, Max: 50}}))
	d := p.layer.mobs[0]
	heard(p)
	use(t, p, "ouch2")
	pass(h, c, 0.1)
	was := d.damage
	wasHealth := p.fight.unit.Health
	use(t, p, "cut")
	pass(h, c, 7)
	if got := d.damage - was; got != 30 {
		t.Fatalf("did %g over its 6 s, want 3 ticks of 10", got)
	}
	if got := p.fight.unit.Health - wasHealth; got != 15 {
		t.Fatalf("drained %g, want 15", got)
	}
	ticks := 0
	for _, m := range heard(p, "hit") {
		if m["ticked"] == "bleed" {
			ticks++
			if m["class"] != p.fight.class.ID {
				t.Fatalf("a tick doesn't say its class: %v", m)
			}
			if _, named := m["ability"]; named {
				t.Fatalf("a tick says it's an ability: %v", m)
			}
		}
	}
	if ticks != 3 {
		t.Fatalf("heard %d ticks", ticks)
	}
	if len(d.Statuses) != 0 {
		t.Fatalf("still held: %v", d.Statuses)
	}

	// Twice as often, twice as hard, and twice for two stacks.
	use(t, p, "more")
	use(t, p, "quick")
	pass(h, c, 0.1)
	use(t, p, "cut")
	use(t, p, "cut")
	pass(h, c, 0.05)
	was = d.damage
	pass(h, c, 1.1)
	if got := d.damage - was; got != 40 {
		t.Fatalf("a tick did %g, want 10 x 2 stacks x 2", got)
	}
}

// Putting a periodic on again doesn't start its ticks over.
func TestRefreshKeepsTheTickSchedule(t *testing.T) {
	h, p, c := statusFight(t, nil)
	class := p.fight.class
	class.Statuses = append(class.Statuses, combat.Status{ID: "bleed", Name: "Bleed", Duration: 20, Stacking: "refresh", Effects: effects(t, `[{"type":"periodic","every":2,"does":"damage","amount":10}]`)})
	class.Abilities = append(class.Abilities, onDummy("cut", combat.Effect{Type: "status", Affects: "target", Status: "bleed"}))
	d := p.layer.mobs[0]
	was := d.damage
	use(t, p, "cut")
	for n := 0; n < 4; n++ {
		pass(h, c, 0.5)
		if n == 2 {
			use(t, p, "cut")
		}
	}
	pass(h, c, 0.2)
	if got := d.damage - was; got != 10 {
		t.Fatalf("did %g by 2.2 s, want one tick", got)
	}
}

// A periodic can hit an effect area, share past its soft cap, heal, and give resources.
func TestPeriodicKinds(t *testing.T) {
	h, p, c := statusFight(t, nil)
	class := p.fight.class
	grit := combat.Resource{Key: "grit", Kind: "points", Max: 10}
	class.Resources = append(class.Resources, grit)
	class.Statuses = append(class.Statuses,
		combat.Status{ID: "warm", Name: "Warm", Effects: effects(t, `[{"type":"periodic","every":1,"does":"heal","amount":{"maxHealth":0.1}},{"type":"periodic","every":1,"does":"resource","resource":"grit","amount":1}]`)},
		combat.Status{ID: "burn", Name: "Burn", Effects: effects(t, `[{"type":"periodic","every":1,"does":"damage","amount":10,"affects":"enemies","radius":100000,"softCap":1}]`)})
	class.Abilities = append(class.Abilities, selfBuff("warm", gaining("warm")), selfBuff("burn", gaining("burn")),
		selfBuff("ouch3", combat.Effect{Type: "damage", Affects: "self", Amount: combat.Amount{Min: 50, Max: 50}}))
	use(t, p, "ouch3")
	pass(h, c, 0.1)
	was := p.fight.unit.Health
	use(t, p, "warm")
	pass(h, c, 1.1)
	if got := p.fight.unit.Health - was; got != p.fight.unit.MaxHealth*0.1 {
		t.Fatalf("healed %g", got)
	}
	if p.fight.resources["grit"] != 1 {
		t.Fatalf("grit = %g", p.fight.resources["grit"])
	}
	d := p.layer.mobs[0]
	before := d.damage
	use(t, p, "burn")
	pass(h, c, 1.1)
	if got := d.damage - before; got != 10/float64(max(len(p.layer.mobs), 1)) {
		t.Fatalf("burned %g with %d dummies", got, len(p.layer.mobs))
	}
}

// An ability's drain heals you by a share of what it did, and `slowed` follows your speed.
func TestDrainAndSlowed(t *testing.T) {
	h, p, c := statusFight(t, map[string]string{
		"mire": `[{"type":"stat","stat":"movementSpeed","multiply":0.5}]`,
	})
	class := p.fight.class
	class.Abilities = append(class.Abilities, onDummy("sap", combat.Effect{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 40, Max: 40}, Drain: 0.25}),
		selfBuff("ouch4", combat.Effect{Type: "damage", Affects: "self", Amount: combat.Amount{Min: 50, Max: 50}}))
	use(t, p, "ouch4")
	pass(h, c, 0.1)
	was := p.fight.unit.Health
	use(t, p, "sap")
	pass(h, c, 0.5)
	if got := p.fight.unit.Health - was; got != 10 {
		t.Fatalf("drained %g, want 10", got)
	}
	if slices.Contains(p.layer.combat.fighterState(&p.fight.unit, h.now()), "slowed") {
		t.Fatal("slowed with nothing on")
	}
	use(t, p, "mire")
	pass(h, c, 0.1)
	if !slices.Contains(p.layer.combat.fighterState(&p.fight.unit, h.now()), "slowed") {
		t.Fatal("not slowed")
	}
}

// triggered is a fight holding `watch`, with `hit` for 100 on the dummy.
func triggered(t *testing.T, watch string) (*Hub, *Player, *float64) {
	t.Helper()
	h, p, c := statusFight(t, map[string]string{"watch": watch})
	p.fight.class.Resources = append(p.fight.class.Resources, combat.Resource{Key: "grit", Kind: "points", Max: 100})
	use(t, p, "watch")
	pass(h, c, 0.1)
	return h, p, c
}

const giveGrit = `"effect":{"type":"resource","affects":"self","resource":"grit","amount":1}`

func TestTriggersOnHits(t *testing.T) {
	for _, c := range []struct {
		name  string
		watch string
		want  float64
	}{
		{"deal damage", `{"type":"trigger","on":"dealDamage",` + giveGrit + `}`, 1},
		{"a crit only on a crit", `{"type":"trigger","on":"crit",` + giveGrit + `}`, 0},
		{"not a crit", `{"type":"trigger","on":"nonCrit",` + giveGrit + `}`, 1},
		{"narrowed to its school", `{"type":"trigger","on":"dealDamage","school":"holy",` + giveGrit + `}`, 1},
		{"narrowed away", `{"type":"trigger","on":"dealDamage","school":"frost",` + giveGrit + `}`, 0},
		{"narrowed to the ability", `{"type":"trigger","on":"dealDamage","abilities":["hit"],` + giveGrit + `}`, 1},
		{"a chance that fails", `{"type":"trigger","on":"dealDamage","chance":0.25,` + giveGrit + `}`, 0},
		{"a chance that lands", `{"type":"trigger","on":"dealDamage","chance":0.75,` + giveGrit + `}`, 1},
		{"a cast", `{"type":"trigger","on":"cast","abilities":["hit"],` + giveGrit + `}`, 1},
		{"takes damage only when it does", `{"type":"trigger","on":"takeDamage",` + giveGrit + `}`, 0},
	} {
		t.Run(c.name, func(t *testing.T) {
			h, p, clock := triggered(t, `[`+c.watch+`]`)
			hitFor(t, h, p, clock)
			if got := p.fight.resources["grit"]; got != c.want {
				t.Fatalf("grit = %g, want %g", got, c.want)
			}
		})
	}
}

func TestTriggerSharesWhatSetItOffAndCantLoop(t *testing.T) {
	h, p, c := triggered(t, `[{"type":"trigger","on":"dealDamage","effect":{"type":"damage","affects":"target","amount":{"shareOfTrigger":0.5}}}]`)
	// 100, then half of each hit it sets off until the chain stops: 50, 25, 12.5 and 6.25.
	if got := hitFor(t, h, p, c); got != 193.75 {
		t.Fatalf("hit for %g, want 193.75", got)
	}
}

func TestTriggerLimits(t *testing.T) {
	grit := func(p *Player) float64 { return p.fight.resources["grit"] }
	t.Run("cooldown", func(t *testing.T) {
		h, p, c := triggered(t, `[{"type":"trigger","on":"dealDamage","cooldown":10,`+giveGrit+`}]`)
		hitFor(t, h, p, c)
		hitFor(t, h, p, c)
		if grit(p) != 1 {
			t.Fatalf("grit = %g, want 1", grit(p))
		}
		pass(h, c, 11)
		hitFor(t, h, p, c)
		if grit(p) != 2 {
			t.Fatalf("grit = %g, want 2", grit(p))
		}
	})
	t.Run("every", func(t *testing.T) {
		h, p, c := triggered(t, `[{"type":"trigger","on":"dealDamage","every":2,`+giveGrit+`}]`)
		hitFor(t, h, p, c)
		if grit(p) != 0 {
			t.Fatal("fired on the first")
		}
		hitFor(t, h, p, c)
		if grit(p) != 1 {
			t.Fatal("didn't fire on the second")
		}
	})
	t.Run("resetOn", func(t *testing.T) {
		h, p, c := triggered(t, `[{"type":"trigger","on":"crit","every":2,"resetOn":"nonCrit",`+giveGrit+`}]`)
		_ = c
		w := p.fight.unit.Statuses[statusKey{"watch", p.ID()}]
		v := &p.fight.unit
		p.layer.combat.fire(event{on: "crit", who: v, other: -1}, h.now())
		p.layer.combat.fire(event{on: "nonCrit", who: v, other: -1}, h.now())
		p.layer.combat.fire(event{on: "crit", who: v, other: -1}, h.now())
		if grit(p) != 0 {
			t.Fatalf("fired with no two in a row, counts %v", w.counts)
		}
		p.layer.combat.fire(event{on: "crit", who: v, other: -1}, h.now())
		if grit(p) != 1 {
			t.Fatalf("didn't fire on two in a row, counts %v", w.counts)
		}
	})
	t.Run("spendsStack", func(t *testing.T) {
		h, p, c := triggered(t, `[{"type":"trigger","on":"dealDamage","spendsStack":true,`+giveGrit+`}]`)
		hitFor(t, h, p, c)
		if held(p, "watch") != nil || grit(p) != 1 {
			t.Fatalf("still held, grit %g", grit(p))
		}
		hitFor(t, h, p, c)
		if grit(p) != 1 {
			t.Fatal("fired after it was gone")
		}
	})
}

func TestTriggersOnAStatusLife(t *testing.T) {
	grit := func(p *Player) float64 { return p.fight.resources["grit"] }
	t.Run("gained, once, at its stacks", func(t *testing.T) {
		h, p, c := statusFight(t, nil)
		class := p.fight.class
		class.Resources = append(class.Resources, combat.Resource{Key: "grit", Kind: "points", Max: 100})
		class.Statuses = append(class.Statuses, combat.Status{ID: "pile", Name: "Pile", Stacking: "stack", MaxStacks: 3,
			Effects: effects(t, `[{"type":"trigger","on":"statusGained",`+giveGrit+`},{"type":"trigger","on":"statusGained","atMax":true,"resets":true,"effect":{"type":"resource","affects":"self","resource":"grit","amount":10}}]`)})
		class.Abilities = append(class.Abilities, selfBuff("pile", gaining("pile")))
		for i := 0; i < 2; i++ {
			use(t, p, "pile")
			pass(h, c, 0.1)
		}
		if grit(p) != 2 {
			t.Fatalf("grit = %g, want one each", grit(p))
		}
		use(t, p, "pile")
		pass(h, c, 0.1)
		if grit(p) != 13 || held(p, "pile") != nil {
			t.Fatalf("grit = %g, held %v", grit(p), held(p, "pile"))
		}
	})
	t.Run("ends", func(t *testing.T) {
		h, p, c := statusFight(t, nil)
		class := p.fight.class
		class.Resources = append(class.Resources, combat.Resource{Key: "grit", Kind: "points", Max: 100})
		class.Statuses = append(class.Statuses, combat.Status{ID: "brief", Name: "Brief", Duration: 1, Effects: effects(t, `[{"type":"trigger","on":"statusEnds",`+giveGrit+`}]`)})
		class.Abilities = append(class.Abilities, selfBuff("brief", gaining("brief")))
		use(t, p, "brief")
		pass(h, c, 0.5)
		if grit(p) != 0 {
			t.Fatal("fired early")
		}
		pass(h, c, 1)
		if grit(p) != 1 {
			t.Fatalf("grit = %g, want 1", grit(p))
		}
	})
}

func TestTriggerOnHealthAndHeals(t *testing.T) {
	h, p, c := triggered(t, `[{"type":"trigger","on":"healthBelow","threshold":70,`+giveGrit+`},{"type":"trigger","on":"healed",`+giveGrit+`},{"type":"trigger","on":"overheal","effect":{"type":"resource","affects":"self","resource":"grit","amount":{"shareOfTrigger":1}}}]`)
	use(t, p, "ouch")
	pass(h, c, 0.5)
	// Falling past 70% fires once, and staying under doesn't again.
	if got := p.fight.resources["grit"]; got != 1 {
		t.Fatalf("grit = %g, want 1", got)
	}
	use(t, p, "ouch")
	pass(h, c, 0.5)
	if got := p.fight.resources["grit"]; got != 1 {
		t.Fatalf("grit = %g, still 1", got)
	}
	use(t, p, "soothe")
	pass(h, c, 0.5)
	if got := p.fight.resources["grit"]; got != 2 {
		t.Fatalf("grit = %g, want 2 after a heal", got)
	}
	p.fight.unit.Health = p.fight.unit.MaxHealth - 4
	use(t, p, "soothe")
	pass(h, c, 0.5)
	if got := p.fight.resources["grit"]; got != 9 {
		t.Fatalf("grit = %g, want 9 with 1 for the heal and 6 for what's past full", got)
	}
}

func TestTriggerWatchingTheCaster(t *testing.T) {
	h, p, c := statusFight(t, map[string]string{})
	class := p.fight.class
	class.Resources = append(class.Resources, combat.Resource{Key: "grit", Kind: "points", Max: 100})
	class.Statuses = append(class.Statuses, combat.Status{ID: "mark", Name: "Mark", Effects: effects(t, `[{"type":"trigger","of":"caster","on":"dealDamage",`+giveGrit+`}]`)})
	class.Abilities = append(class.Abilities, onDummy("mark", combat.Effect{Type: "status", Affects: "target", Status: "mark"}))
	use(t, p, "mark")
	pass(h, c, 0.1)
	hitFor(t, h, p, c)
	// It lands on its holder, a dummy, who has no grit: the caster did it, and nothing's given.
	if got := p.layer.mobs[0].Statuses[statusKey{"mark", p.ID()}]; got == nil || got.fired == nil {
		t.Fatalf("didn't fire: %+v", got)
	}
}

// Choosing a build changes what you know and hold, stays out of combat, and goes back on if you change again.
func TestChoosingABuild(t *testing.T) {
	h, p, c := statusFight(t, nil)
	class := *p.fight.class
	class.Statuses = append(class.Statuses[:len(class.Statuses):len(class.Statuses)], combat.Status{ID: "sguard", Name: "Guard", Effects: effects(t, `[{"type":"stat","stat":"damageDone","multiply":2}]`)}, combat.Status{ID: "sblade", Name: "Blade"})
	class.Abilities = append(class.Abilities[:len(class.Abilities):len(class.Abilities)], selfBuff("wall"))
	class.Specializations = []combat.Specialization{{ID: "guard", Status: "sguard", Abilities: []string{"wall"}}, {ID: "blade", Status: "sblade"}}
	p.enterFight(&class, 10, combat.Build{})
	pass(h, c, 60)
	heard(p)
	use(t, p, "wall")
	if got := heard(p, "refused"); len(got) != 1 {
		t.Fatalf("knew a spec's ability with no spec: %v", got)
	}
	ask(t, p, `{"type":"build","specialization":"guard","talents":{}}`)
	got := heard(p, "build")
	if len(got) != 1 || got[0]["specialization"] != "guard" {
		t.Fatalf("heard %v", got)
	}
	use(t, p, "wall")
	if got := heard(p, "refused"); len(got) != 0 {
		t.Fatalf("refused: %v", got)
	}
	pass(h, c, 0.1)
	if got := hitFor(t, h, p, c); got != 200 {
		t.Fatalf("hit for %g, want 200 with the spec's status", got)
	}
	// In combat now, from that hit.
	ask(t, p, `{"type":"build","specialization":"blade"}`)
	if got := heard(p, "refused"); len(got) != 1 || p.fight.build.Specialization != "guard" {
		t.Fatalf("changed in combat: %v", got)
	}
	pass(h, c, 6)
	p.layer.chooseBuild(p, combat.Build{Specialization: "blade"})
	if p.fight.unit.Statuses[statusKey{"sguard", p.ID()}] != nil || p.fight.unit.Statuses[statusKey{"sblade", p.ID()}] == nil {
		t.Fatalf("holding %v", p.fight.unit.Statuses)
	}
	if got := hitFor(t, h, p, c); got != 100 {
		t.Fatalf("hit for %g, want 100 with the old spec gone", got)
	}
}

func TestSettingBars(t *testing.T) {
	h, p, _ := statusFight(t, nil)
	ask(t, p, `{"type":"bars","bars":[["a",""],["b"]]}`)
	if len(p.fight.bars) != 2 {
		t.Fatalf("bars = %v", p.fight.bars)
	}
	// They come back as it enters again.
	h.characters.(*fakeCharacters).bars[1] = p.fight.bars
	gone(h, p)
	again := enter(t, h, 1)
	if got := heard(again, "bars"); len(got) != 1 {
		t.Fatalf("heard bars %v", got)
	}
	for _, bad := range [][][]string{nil, {{}, {}, {}, {}}, {make([]string, maxSlots+1)}, {{strings.Repeat("x", maxSlotLen+1)}}} {
		p.layer.setBars(p, bad)
		if len(p.fight.bars) != 2 {
			t.Fatalf("took %v", bad)
		}
	}
}

// A dummy that swings back lets you dodge, parry and block, and each can set off a trigger.
func TestSparringAndTheAttackTable(t *testing.T) {
	for _, c := range []struct {
		stat, on string
		roll     float64 // what every roll comes to
		took     float64 // of 120 health, 5% is 6
	}{
		{"dodge", "dodge", 0.1, 0},
		{"parry", "parry", 0.1, 0},
		{"block", "block", 0.5, 4.2},
	} {
		t.Run(c.stat, func(t *testing.T) {
			h, p, clock := triggered(t, `[{"type":"stat","stat":"dodge","add":-3},{"type":"stat","stat":"parry","add":-3},{"type":"stat","stat":"`+c.stat+`","add":100},{"type":"trigger","on":"`+c.on+`",`+giveGrit+`}]`)
			p.fight.sparring = true
			p.state.At = p.layer.mobs[0].state.At
			p.state.At[2] -= 5
			p.state.Yaw = 0
			h.roll = func() float64 { return c.roll }
			heard(p)
			was := p.fight.unit.Health
			pass(h, clock, 0.1)
			if got := was - p.fight.unit.Health; math.Abs(got-c.took) > 1e-9 {
				t.Fatalf("took %g, want %g", got, c.took)
			}
			if p.fight.resources["grit"] != 1 {
				t.Fatalf("grit = %g, want 1 from the trigger", p.fight.resources["grit"])
			}
			hits := heard(p, "hit")
			if len(hits) == 0 {
				t.Fatal("no hit")
			}
			last := hits[len(hits)-1]
			if c.stat == "block" && last["blocked"] != true || c.stat != "block" && last["avoided"] != c.stat {
				t.Fatalf("hit %v", last)
			}
		})
	}
}

// From behind you can't parry or block, though you can still dodge.
func TestBehindCantBeParried(t *testing.T) {
	h, p, c := triggered(t, `[{"type":"stat","stat":"dodge","add":-3},{"type":"stat","stat":"parry","add":100}]`)
	p.fight.sparring = true
	p.state.At = p.layer.mobs[0].state.At
	p.state.At[2] += 5
	p.state.Yaw = 0 // facing away from the dummy, which is on the -z side
	h.roll = func() float64 { return 0.5 }
	was := p.fight.unit.Health
	pass(h, c, 0.1)
	if got := was - p.fight.unit.Health; got != 6 {
		t.Fatalf("took %g, want 6", got)
	}
}

func TestSparNeverKills(t *testing.T) {
	h, p, c := statusFight(t, nil)
	p.fight.sparring = true
	p.state.At = p.layer.mobs[0].state.At
	p.fight.unit.Health = 2
	pass(h, c, 10)
	if got := p.fight.unit.Health; got != 1 {
		t.Fatalf("health = %g, want 1", got)
	}
}

func TestHasteSpeedsCastsAndTicks(t *testing.T) {
	per := combat.RatingPerPoint(1)
	h, p, c := statusFight(t, map[string]string{
		"quick": fmt.Sprintf(`[{"type":"stat","stat":"hasteRating","add":%g}]`, 100*per),
	})
	class := p.fight.class
	zero := 0.0
	class.Abilities = append(class.Abilities, combat.Ability{ID: "slow", Name: "slow", Target: "self", GCD: &zero, CastTime: 2})
	use(t, p, "quick")
	pass(h, c, 0.1)
	heard(p)
	use(t, p, "slow")
	got := heard(p, "used")
	if len(got) != 1 || got[0]["castTime"] != 1.0 {
		t.Fatalf("used %v", got)
	}
}
