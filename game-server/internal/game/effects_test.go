package game

import (
	"fmt"
	"testing"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// spending is a fight with an ability on a 30 s cooldown, and others that work on it.
func spending(t *testing.T, charges int, effects ...combat.Effect) (*Hub, *Player, *float64) {
	t.Helper()
	zero := 0.0
	var abilities []combat.Ability
	for i, e := range effects {
		abilities = append(abilities, combat.Ability{ID: "work" + string(rune('a'+i)), Name: "Work", Target: "self", GCD: &zero, Effects: []combat.Effect{e}})
	}
	h, p, c := consuming(t, combat.Status{ID: "unused", Name: "Unused"})
	p.fight.class.Abilities = append(p.fight.class.Abilities, abilities...)
	p.fight.class.Abilities = append(p.fight.class.Abilities, combat.Ability{ID: "big", Name: "Big", Target: "self", GCD: &zero, Cooldown: 30, Charges: charges, Tags: []string{"spender"}})
	return h, p, c
}

func lastCooldown(t *testing.T, p *Player, ability string) float64 {
	t.Helper()
	got := heard(p, "cooldown")
	for i := len(got) - 1; i >= 0; i-- {
		if got[i]["ability"] == ability {
			return got[i]["seconds"].(float64)
		}
	}
	t.Fatalf("heard no cooldown for %s: %v", ability, got)
	return 0
}

func TestCooldownEffectTakesTimeOff(t *testing.T) {
	h, p, c := spending(t, 1, combat.Effect{Type: "cooldown", Affects: "self", Abilities: []string{"big"}, By: 10})
	use(t, p, "big")
	pass(h, c, 0.05)
	heard(p)
	use(t, p, "worka")
	pass(h, c, 0.05)
	if got := lastCooldown(t, p, "big"); got < 19.8 || got > 20 {
		t.Fatalf("the bar was told %g s, want about 20", got)
	}
	pass(h, c, 15)
	use(t, p, "big")
	pass(h, c, 0.05)
	if got := heard(p, "refused"); len(got) != 1 {
		t.Fatalf("15 s in it should still be cooling: %v", got)
	}
	pass(h, c, 6)
	use(t, p, "big")
	pass(h, c, 0.05)
	if got := heard(p, "refused"); len(got) != 0 {
		t.Fatalf("21 s in it should be ready: %v", got)
	}
}

func TestCooldownEffectResetsByTag(t *testing.T) {
	h, p, c := spending(t, 2, combat.Effect{Type: "cooldown", Affects: "self", Tag: "spender", Reset: true})
	use(t, p, "big")
	use(t, p, "big")
	pass(h, c, 0.05)
	heard(p)
	use(t, p, "worka")
	pass(h, c, 0.05)
	if got := lastCooldown(t, p, "big"); got != 0 {
		t.Fatalf("the bar was told %g s, want 0", got)
	}
	if got := len(p.fight.cooldowns["big"]); got != 0 {
		t.Fatalf("%d charges still spent", got)
	}
}

func TestCooldownEffectGivesChargesBack(t *testing.T) {
	h, p, c := spending(t, 2, combat.Effect{Type: "cooldown", Affects: "self", Abilities: []string{"big"}, Charges: 1})
	use(t, p, "big")
	pass(h, c, 0.05)
	if got := lastCooldown(t, p, "big"); got != 0 {
		t.Fatalf("with a charge left the bar was told %g s", got)
	}
	use(t, p, "big")
	pass(h, c, 0.05)
	if got := lastCooldown(t, p, "big"); got < 29 || got > 30 {
		t.Fatalf("with none left the bar was told %g s", got)
	}
	use(t, p, "worka")
	pass(h, c, 0.05)
	if got := lastCooldown(t, p, "big"); got != 0 {
		t.Fatalf("with one back the bar was told %g s", got)
	}
	if got := len(p.fight.cooldowns["big"]); got != 1 {
		t.Fatalf("%d charges spent, want 1", got)
	}
}

// dispelling is a fight where the player has abilities to put each status on itself or the dummy, and a dispel.
func dispelling(t *testing.T, statuses []combat.Status, dispel combat.Effect) (*Hub, *Player, *float64) {
	t.Helper()
	h, p, c := fighting(t)
	zero := 0.0
	p.fight.class.Statuses = append(p.fight.class.Statuses, statuses...)
	for _, s := range statuses {
		p.fight.class.Abilities = append(p.fight.class.Abilities,
			combat.Ability{ID: "me" + s.ID, Name: "Me", Target: "self", GCD: &zero, Effects: []combat.Effect{{Type: "status", Affects: "self", Status: s.ID}}},
			combat.Ability{ID: "it" + s.ID, Name: "It", Target: "enemy", GCD: &zero, Range: combat.Distance{Feet: 100}, Effects: []combat.Effect{{Type: "status", Affects: "target", Status: s.ID}}})
	}
	p.fight.class.Abilities = append(p.fight.class.Abilities,
		combat.Ability{ID: "clean", Name: "Clean", Target: "any", GCD: &zero, Range: combat.Distance{Feet: 100}, Effects: []combat.Effect{dispel}})
	return h, p, c
}

func useOn(t *testing.T, p *Player, ability string, target int64) {
	t.Helper()
	if err := p.Handle([]byte(fmt.Sprintf(`{"type":"use","ability":%q,"target":%d}`, ability, target))); err != nil {
		t.Fatal(err)
	}
}

func TestDispelByKindControlSlowAndTag(t *testing.T) {
	half := 0.5
	statuses := []combat.Status{
		{ID: "pois", Name: "Poison", Kind: "debuff", Dispel: "poison"},
		{ID: "fire", Name: "Burn", Kind: "debuff", Dispel: "magic"},
		{ID: "stun", Name: "Stun", Kind: "debuff", Effects: []combat.StatusEffect{{Type: "control", Control: "stun"}}},
		{ID: "slow", Name: "Slow", Kind: "debuff", Effects: []combat.StatusEffect{{Type: "stat", Stat: "movementSpeed", Multiply: &half}}},
		{ID: "mark", Name: "Mark", Kind: "debuff", Tags: []string{"curse-ish"}},
		{ID: "none", Name: "Stuck", Kind: "debuff"},
	}
	for _, each := range []struct {
		dispel combat.Effect
		gone   string
	}{
		{combat.Effect{Dispels: []string{"poison", "disease"}}, "pois"},
		{combat.Effect{Dispels: []string{"stun", "root"}}, "stun"},
		{combat.Effect{Dispels: []string{"slow"}}, "slow"},
		{combat.Effect{Tags: []string{"curse-ish"}}, "mark"},
	} {
		each.dispel.Type, each.dispel.Affects = "dispel", "target"
		h, p, c := dispelling(t, statuses, each.dispel)
		for _, s := range statuses {
			use(t, p, "me"+s.ID)
		}
		pass(h, c, 0.05)
		heard(p)
		useOn(t, p, "clean", 0)
		pass(h, c, 0.05)
		for _, s := range statuses {
			have := p.fight.vitals.Statuses[statusKey{s.ID, p.ID()}] != nil
			if have == (s.ID == each.gone) {
				t.Fatalf("%v: %s held = %v", each.dispel, s.ID, have)
			}
		}
		got := heard(p, "hit")
		if len(got) != 1 || got[0]["removed"] != each.gone || got[0]["class"] != "frst0001" {
			t.Fatalf("%v: hits = %v", each.dispel, got)
		}
	}
}

func TestDispelCountsOldestFirst(t *testing.T) {
	statuses := []combat.Status{{ID: "aaa", Name: "A", Kind: "debuff", Dispel: "magic"}, {ID: "bbb", Name: "B", Kind: "debuff", Dispel: "magic"}, {ID: "ccc", Name: "C", Kind: "debuff", Dispel: "magic"}}
	h, p, c := dispelling(t, statuses, combat.Effect{Type: "dispel", Affects: "target", Dispels: []string{"magic"}, Count: 2})
	for _, id := range []string{"meccc", "mebbb", "meaaa"} {
		use(t, p, id)
		pass(h, c, 0.05)
	}
	useOn(t, p, "clean", 0)
	pass(h, c, 0.05)
	if s := p.fight.vitals.Statuses; len(s) != 1 || s[statusKey{"aaa", p.ID()}] == nil {
		t.Fatalf("left on: %v", s)
	}
}

// A dispel takes what harms a friend and what helps an enemy, not the other way round.
func TestDispelLeavesFriendsBuffsAndEnemiesDebuffs(t *testing.T) {
	statuses := []combat.Status{{ID: "good", Name: "Good", Kind: "buff", Dispel: "magic"}, {ID: "bad", Name: "Bad", Kind: "debuff", Dispel: "magic"}}
	h, p, c := dispelling(t, statuses, combat.Effect{Type: "dispel", Affects: "target", Dispels: []string{"magic"}, Count: 2})
	for _, id := range []string{"megood", "mebad", "itgood", "itbad"} {
		use(t, p, id)
	}
	pass(h, c, 0.05)
	useOn(t, p, "clean", 0)
	useOn(t, p, "clean", -1)
	pass(h, c, 0.05)
	if s := p.fight.vitals.Statuses; len(s) != 1 || s[statusKey{"good", p.ID()}] == nil {
		t.Fatalf("on you: %v", s)
	}
	if s := p.layer.dummies[0].Statuses; len(s) != 1 || s[statusKey{"bad", p.ID()}] == nil {
		t.Fatalf("on the dummy: %v", s)
	}
}

func TestDispelSetsOffItsTriggers(t *testing.T) {
	h, p, c := triggered(t, `[{"type":"trigger","on":"dispel",`+giveGrit+`}]`)
	zero := 0.0
	p.fight.class.Statuses = append(p.fight.class.Statuses, combat.Status{ID: "bad", Name: "Bad", Kind: "debuff", Dispel: "magic"})
	p.fight.class.Abilities = append(p.fight.class.Abilities,
		combat.Ability{ID: "foul", Name: "Foul", Target: "self", GCD: &zero, Effects: []combat.Effect{{Type: "status", Affects: "self", Status: "bad"}}},
		combat.Ability{ID: "clean", Name: "Clean", Target: "self", GCD: &zero, Effects: []combat.Effect{{Type: "dispel", Affects: "self", Dispels: []string{"magic"}}}})
	use(t, p, "foul")
	pass(h, c, 0.05)
	was := p.fight.resources["grit"]
	use(t, p, "clean")
	pass(h, c, 0.05)
	if got := p.fight.resources["grit"] - was; got != 1 {
		t.Fatalf("gained %g grit, want 1", got)
	}
}

func TestAnyTargetTakesEnemiesAndFriends(t *testing.T) {
	h, p, c := dispelling(t, nil, combat.Effect{Type: "heal", Affects: "target", Amount: combat.Amount{Min: 5, Max: 5}})
	dummy := p.layer.dummies[0]
	dummy.Health = 10
	p.fight.vitals.Health = 10
	useOn(t, p, "clean", -1)
	pass(h, c, 0.05)
	if dummy.Health != 15 || p.fight.vitals.Health < 10 || p.fight.vitals.Health >= 15 {
		t.Fatalf("on the dummy: it has %g, you have %g", dummy.Health, p.fight.vitals.Health)
	}
	useOn(t, p, "clean", 0)
	pass(h, c, 0.05)
	if dummy.Health != 15 || p.fight.vitals.Health < 15 {
		t.Fatalf("with no target: it has %g, you have %g", dummy.Health, p.fight.vitals.Health)
	}
}

// interrupting is two players, one with a 2 s frost cast and a holy instant, and one who can stop it.
func interrupting(t *testing.T) (*Hub, *Player, *Player, *float64) {
	t.Helper()
	zero := 0.0
	return two(t, nil,
		combat.Ability{ID: "icecast", Name: "Bolt", School: "frost", Target: "self", GCD: &zero, CastTime: 2},
		combat.Ability{ID: "chill", Name: "Chill", School: "frost", Target: "self", GCD: &zero},
		combat.Ability{ID: "glow", Name: "Glow", School: "holy", Target: "self", GCD: &zero},
		combat.Ability{ID: "hush", Name: "Hush", Target: "ally", GCD: &zero, Range: combat.Distance{Feet: 100}, Effects: []combat.Effect{{Type: "interrupt", Affects: "target", Lockout: 4}}})
}

func TestInterruptStopsACastAndLocksItsSchool(t *testing.T) {
	h, p, other, c := interrupting(t)
	use(t, other, "icecast")
	pass(h, c, 0.5)
	heard(p)
	heard(other)
	useOn(t, p, "hush", other.ID())
	pass(h, c, 0.05)
	if other.fight.cast != nil {
		t.Fatal("the cast went on")
	}
	got := heard(other, "lockout", "stopped")
	if len(got) != 2 || got[0]["type"] != "stopped" || got[1]["school"] != "frost" || got[1]["seconds"] != 4.0 {
		t.Fatalf("they heard %v", got)
	}
	if hits := heard(p, "hit"); len(hits) != 1 || hits[0]["stopped"] != "icecast" {
		t.Fatalf("hits = %v", hits)
	}
	use(t, other, "chill")
	use(t, other, "glow")
	pass(h, c, 0.05)
	if got := heard(other, "refused"); len(got) != 1 || got[0]["ability"] != "chill" {
		t.Fatalf("refused = %v", got)
	}
	pass(h, c, 4)
	use(t, other, "chill")
	pass(h, c, 0.05)
	if got := heard(other, "refused"); len(got) != 0 {
		t.Fatalf("still locked out: %v", got)
	}
}

func TestInterruptWithNothingToStop(t *testing.T) {
	h, p, other, c := interrupting(t)
	heard(p)
	heard(other)
	useOn(t, p, "hush", other.ID())
	pass(h, c, 0.05)
	if got := heard(other, "lockout"); len(got) != 0 {
		t.Fatalf("they heard %v", got)
	}
	if got := heard(p, "hit"); len(got) != 0 {
		t.Fatalf("hits = %v", got)
	}
}

func TestUnitsShowWhatTheyHold(t *testing.T) {
	statuses := []combat.Status{{ID: "mark", Name: "Mark", Kind: "debuff", Duration: 20}}
	h, p, c := dispelling(t, statuses, combat.Effect{Type: "dispel", Affects: "target", Tags: []string{"none"}})
	heard(p)
	use(t, p, "itmark")
	pass(h, c, 0.05)
	got := heard(p, "statusOn")
	if len(got) != 1 || got[0]["id"] != -1.0 || got[0]["status"] != "mark" || got[0]["class"] != "frst0001" || got[0]["stacks"] != 1.0 || got[0]["from"] != float64(p.ID()) {
		t.Fatalf("statusOn = %v", got)
	}
	if lasts := got[0]["lasts"].(float64); lasts != 20 {
		t.Fatalf("lasts %g", lasts)
	}
	// Someone coming later sees it on the dummy, and what you hold on you.
	use(t, p, "memark")
	pass(h, c, 0.05)
	other := enter(t, h, 2)
	var snapshot map[string]any
	for snapshot == nil {
		if m := next(t, other); m["type"] == "snapshot" {
			snapshot = m
		}
	}
	seen := map[float64][]any{}
	for _, each := range snapshot["characters"].([]any) {
		ch := each.(map[string]any)
		seen[ch["id"].(float64)], _ = ch["statuses"].([]any)
	}
	if len(seen[-1]) != 1 || len(seen[float64(p.ID())]) != 1 || seen[-1][0].(map[string]any)["status"] != "mark" {
		t.Fatalf("snapshot = %v", snapshot)
	}
}
