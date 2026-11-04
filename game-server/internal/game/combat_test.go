package game

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"testing"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
	"github.com/delve-mmo/delve3d/game-server/internal/token"
	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

// A world with a dummy 20 ft north of (+z from) the spawn point, and one class.
type fightWorld struct{}

func (fightWorld) Load(_ context.Context, repo, sha string) (*worlds.World, error) {
	yes := true
	zero := 0.0
	return &worlds.World{
		Repo: repo, Sha: sha, Continents: []string{"main", "far"},
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
	people := characters(nil)
	people.class[1], people.class[2] = "frst0001", "frst0001"
	h := NewHub(fightWorld{}, people)
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

func TestPickingAClass(t *testing.T) {
	people := characters(nil)
	h := NewHub(fightWorld{}, people)
	claims := token.Claims{Character: 1, World: 1, Repo: "them/vale", Sha: "s"}
	ctx := context.Background()

	ids, err := h.ClassesToPick(ctx, claims)
	if err != nil || !slices.Equal(ids, []string{"frst0001"}) {
		t.Fatalf("to pick = %v, %v", ids, err)
	}
	if err := h.PickClass(ctx, claims, "nope"); err == nil || people.class[1] != "" {
		t.Fatalf("picked a class the world doesn't have: %v, %q", err, people.class[1])
	}
	if err := h.PickClass(ctx, claims, "frst0001"); err != nil {
		t.Fatal(err)
	}
	if ids, err := h.ClassesToPick(ctx, claims); err != nil || len(ids) != 0 {
		t.Fatalf("to pick after picking = %v, %v", ids, err)
	}
	if w := next(t, enter(t, h, 1)); w["you"].(map[string]any)["class"] != "frst0001" {
		t.Fatalf("welcome = %v", w)
	}

	// A class the world no longer has is as good as none.
	people.class[1] = "gone0001"
	if ids, _ := h.ClassesToPick(ctx, claims); !slices.Equal(ids, []string{"frst0001"}) {
		t.Fatalf("to pick with a lost class = %v", ids)
	}
}

func TestALayerNoOneJoinsUnloads(t *testing.T) {
	h := NewHub(fightWorld{}, characters(nil))
	h.idle = time.Millisecond
	if _, err := h.ClassesToPick(context.Background(), token.Claims{Character: 1, World: 1, Repo: "them/vale", Sha: "s"}); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(time.Second)
	for h.Layers() != 0 {
		if time.Now().After(deadline) {
			t.Fatal("the layer stayed loaded")
		}
		time.Sleep(time.Millisecond)
	}
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

func TestCombatDebugLogsWhatAbilitiesDo(t *testing.T) {
	h, p, c := fighting(t)
	p.systemAdmin = true
	use(t, p, "zap")
	pass(h, c, 2)
	if got := heard(p, "log"); len(got) != 0 {
		t.Fatalf("logged with it off: %v", got)
	}
	say(t, p, "/combatdebug")
	if got := lastLog(t, p); got != "system: Combat debug is on." {
		t.Fatal(got)
	}
	use(t, p, "zap")
	pass(h, c, 2)
	var lines []string
	for _, m := range heard(p, "log") {
		lines = append(lines, m["kind"].(string)+": "+m["text"].(string))
	}
	want := []string{"debug: : spent 100 mana", "debug:  on Training Dummy: damage 10 from 10, crit false"}
	if !slices.Equal(lines, want) {
		t.Fatalf("lines = %q", lines)
	}
	say(t, p, "/combatdebug off")
	if got := lastLog(t, p); got != "system: Combat debug is off." {
		t.Fatal(got)
	}
}

func TestCombatDebugIsForAdmins(t *testing.T) {
	_, p, _ := fighting(t)
	say(t, p, "/combatdebug")
	if got := lastLog(t, p); got != "error: You can't use /combatdebug." {
		t.Fatal(got)
	}
	if p.combatDebug {
		t.Fatal("it turned on")
	}
}

func TestACharacterWithNoClassEntersWithHealth(t *testing.T) {
	h := NewHub(fightWorld{}, characters(nil))
	you := next(t, enter(t, h, 1))["you"].(map[string]any)
	if you["health"] != 100.0 || you["maxHealth"] != 100.0 {
		t.Fatalf("you = %v", you)
	}
}

// A class with an ability for level 1, one for level 3, and one each from a spec and a talent.
func levelledClass() *combat.Class {
	return &combat.Class{
		ID:              "lvld0001",
		Specializations: []combat.Specialization{{ID: "spec", Abilities: []string{"bySpec"}}},
		Talents:         map[string][]combat.Talent{"15": {{Grants: []combat.TalentGrant{{Ability: "byTalent"}}}}},
		Abilities:       []combat.Ability{{ID: "first", Level: 1}, {ID: "third", Level: 3}, {ID: "bySpec", Level: 1}, {ID: "byTalent", Level: 1}},
	}
}

func TestLevelAndChoicesSayWhatYouKnow(t *testing.T) {
	c := levelledClass()
	for _, want := range []struct {
		ability string
		level   int
		knows   bool
	}{{"first", 1, true}, {"third", 1, false}, {"third", 3, true}, {"bySpec", 20, false}, {"byTalent", 20, false}} {
		if got := c.Knows(c.Ability(want.ability), want.level, combat.Build{}); got != want.knows {
			t.Errorf("%s at level %d: knows = %v", want.ability, want.level, got)
		}
	}
}

func TestYouCantUseWhatYouDontKnow(t *testing.T) {
	_, p, _ := fighting(t)
	p.fight.class = &combat.Class{ID: "frst0001", Abilities: []combat.Ability{{ID: "zap", Level: 2, Target: "enemy"}}}
	heard(p, "refused")
	use(t, p, "zap")
	refusal(t, p, "you don't know that")
}

func TestWelcomeSaysYourLevel(t *testing.T) {
	people := characters(nil)
	people.class[1], people.level[1] = "frst0001", 4
	h := NewHub(fightWorld{}, people)
	if w := next(t, enter(t, h, 1)); w["you"].(map[string]any)["level"] != 4.0 {
		t.Fatalf("welcome = %v", w)
	}
}

func TestAutoAttackSwingsUntilStopped(t *testing.T) {
	h, p, c := fighting(t)
	p.state.At[2] += 12 // the dummy's 20 ft north
	if err := p.Handle([]byte(`{"type":"attack","target":-1}`)); err != nil {
		t.Fatal(err)
	}
	pass(h, c, 2.5)
	seen := heard(p, "attacking", "swung", "hit")
	var kinds []string
	for _, m := range seen {
		kinds = append(kinds, m["type"].(string))
	}
	if !slices.Equal(kinds, []string{"attacking", "swung", "hit", "swung", "hit"}) {
		t.Fatalf("heard = %v", kinds)
	}
	if hit := seen[2]; hit["amount"] != combat.WeaponDamage || hit["ability"] != nil || hit["on"] != -1.0 {
		t.Fatalf("hit = %v", hit)
	}
	if err := p.Handle([]byte(`{"type":"attack","target":0}`)); err != nil {
		t.Fatal(err)
	}
	pass(h, c, 5)
	got := heard(p, "attacking", "swung")
	if len(got) != 1 || got[0]["type"] != "attacking" || got[0]["target"] != nil && got[0]["target"] != 0.0 {
		t.Fatalf("after stopping = %v", got)
	}
}

func TestAutoAttackSaysOnceWhenOutOfReachAndWaits(t *testing.T) {
	h, p, c := fighting(t)
	if err := p.Handle([]byte(`{"type":"attack","target":-1}`)); err != nil {
		t.Fatal(err)
	}
	pass(h, c, 3)
	if got := heard(p, "refused", "swung"); len(got) != 1 || got[0]["why"] != "out of range" {
		t.Fatalf("out of reach = %v", got)
	}
	p.state.At[2] += 12
	pass(h, c, 0.1)
	if got := heard(p, "swung"); len(got) != 1 {
		t.Fatalf("back in reach = %v", got)
	}
}

func TestAMeleeAbilityStartsAutoAttack(t *testing.T) {
	_, p, _ := fighting(t)
	p.state.At[2] += 12
	use(t, p, "jab")
	if got := heard(p, "attacking"); len(got) != 1 || got[0]["target"] != -1.0 {
		t.Fatalf("attacking = %v", got)
	}
}

func TestAttacksCanMiss(t *testing.T) {
	h, p, c := fighting(t)
	h.roll = func() float64 { return 0 }
	use(t, p, "zap")
	pass(h, c, 0.6)
	hits := heard(p, "hit")
	if len(hits) != 1 || hits[0]["missed"] != true || hits[0]["amount"] != nil || hits[0]["health"] != dummyHealth {
		t.Fatalf("hits = %v", hits)
	}
}

func TestResourcesSayTheirMost(t *testing.T) {
	h, p, c := fighting(t)
	use(t, p, "zap")
	pass(h, c, 1)
	got := heard(p, "resources")
	if len(got) == 0 || got[0]["max"].(map[string]any)["mana"] != 1000.0 {
		t.Fatalf("resources = %v", got)
	}
}

// conditional gives p's class abilities with conditions.
func conditional(p *Player, abilities ...combat.Ability) {
	p.fight.class.Abilities = append(p.fight.class.Abilities, abilities...)
	p.fight.class.Statuses = append(p.fight.class.Statuses, combat.Status{ID: "oath", Name: "Oath"}, combat.Status{ID: "wound", Name: "Wound", Duration: 9})
}

func TestRequiresRefusesWithAReason(t *testing.T) {
	_, p, _ := fighting(t)
	twenty := 20.0
	conditional(p, combat.Ability{ID: "finish", Target: "enemy", Range: combat.Distance{Feet: 30}, Requires: []combat.Condition{{Health: "target", Below: &twenty}}})
	use(t, p, "finish")
	refusal(t, p, "your target's health is too high")
	p.layer.dummies[0].Health = 100
	use(t, p, "finish")
	if got := heard(p, "used"); len(got) != 1 {
		t.Fatalf("used = %v", got)
	}
}

func TestAnEffectLandsOnlyWhenItsConditionsHold(t *testing.T) {
	h, p, c := fighting(t)
	wounded := combat.Condition{Status: "wound", On: "target"}
	conditional(p, combat.Ability{ID: "flay", Target: "enemy", Range: combat.Distance{Feet: 30}, Effects: []combat.Effect{
		{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 1, Max: 1}, When: []combat.Condition{{Not: &wounded}}},
		{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 5, Max: 5}, When: []combat.Condition{wounded}},
	}}, combat.Ability{ID: "cut", Target: "enemy", Range: combat.Distance{Feet: 30}, Effects: []combat.Effect{{Type: "status", Affects: "target", Status: "wound"}}})
	use(t, p, "flay")
	pass(h, c, 2)
	if got := heard(p, "hit"); len(got) != 1 || got[0]["amount"] != 1.0 {
		t.Fatalf("unwounded hits = %v", got)
	}
	use(t, p, "cut")
	pass(h, c, 2)
	use(t, p, "flay")
	pass(h, c, 2)
	got := heard(p, "hit")
	if len(got) != 2 || got[1]["amount"] != 5.0 {
		t.Fatalf("wounded hits = %v", got)
	}
}

func TestAnAbilityReadsItsConditionsBeforeAnyEffectLands(t *testing.T) {
	h, p, c := fighting(t)
	has := combat.Condition{Status: "oath", On: "self"}
	conditional(p, combat.Ability{ID: "swear", Target: "self", Effects: []combat.Effect{
		{Type: "status", Affects: "self", Status: "oath", When: []combat.Condition{{Not: &has}}},
		{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 3, Max: 3}, When: []combat.Condition{has}},
	}})
	use(t, p, "swear")
	pass(h, c, 2)
	if got := heard(p, "hit"); len(got) != 1 || got[0]["status"] != "oath" {
		t.Fatalf("the status landing mustn't set off the next effect: %v", got)
	}
}

func TestAStatusWithNoDurationStays(t *testing.T) {
	h, p, c := fighting(t)
	conditional(p, combat.Ability{ID: "swear", Target: "self", Effects: []combat.Effect{{Type: "status", Affects: "self", Status: "oath"}}})
	use(t, p, "swear")
	pass(h, c, 60)
	if p.fight.vitals.Statuses[statusKey{"oath", p.ID()}] == nil {
		t.Fatal("it ran out")
	}
}

func TestBeingInCombatFollowsAttacking(t *testing.T) {
	h, p, c := fighting(t)
	yes := true
	conditional(p, combat.Ability{ID: "angry", Target: "self", Requires: []combat.Condition{{InCombat: &yes}}})
	use(t, p, "angry")
	refusal(t, p, "you need to be in combat")
	use(t, p, "zap")
	pass(h, c, 2)
	heard(p, "used", "hit")
	use(t, p, "angry")
	if got := heard(p, "refused"); len(got) != 0 {
		t.Fatalf("refused = %v", got)
	}
	pass(h, c, 6)
	use(t, p, "angry")
	refusal(t, p, "you need to be in combat")
}

func TestYouDontMissYourself(t *testing.T) {
	h, p, c := fighting(t)
	h.roll = func() float64 { return 0 }
	conditional(p, combat.Ability{ID: "bleed", Target: "self", Effects: []combat.Effect{{Type: "damage", Affects: "self", Amount: combat.Amount{Min: 3, Max: 3}}}})
	before := p.fight.vitals.Health
	use(t, p, "bleed")
	pass(h, c, 1)
	if p.fight.vitals.Health >= before {
		t.Fatalf("health = %v", p.fight.vitals.Health)
	}
}
