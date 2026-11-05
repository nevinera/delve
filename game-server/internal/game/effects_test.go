package game

import (
	"fmt"
	"math"
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
		{ID: "hold", Name: "Hold", Kind: "debuff", Effects: []combat.StatusEffect{{Type: "control", Control: "root"}}},
		{ID: "slow", Name: "Slow", Kind: "debuff", Effects: []combat.StatusEffect{{Type: "stat", Stat: "movementSpeed", Multiply: &half}}},
		{ID: "mark", Name: "Mark", Kind: "debuff", Tags: []string{"curse-ish"}},
		{ID: "none", Name: "Stuck", Kind: "debuff"},
	}
	for _, each := range []struct {
		dispel combat.Effect
		gone   string
	}{
		{combat.Effect{Dispels: []string{"poison", "disease"}}, "pois"},
		{combat.Effect{Dispels: []string{"stun", "root"}}, "hold"},
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

// controlled is a fight where the player can hold itself with a control for 5 s.
func controlled(t *testing.T, control string) (*Hub, *Player, *float64) {
	t.Helper()
	zero := 0.0
	h, p, c := dispelling(t, []combat.Status{{ID: "held", Name: "Held", Kind: "debuff", Duration: 5, Effects: []combat.StatusEffect{{Type: "control", Control: control}}}}, combat.Effect{Type: "dispel", Affects: "self"})
	p.fight.class.Abilities = append(p.fight.class.Abilities,
		combat.Ability{ID: "sing", Name: "Sing", School: "holy", Target: "self", GCD: &zero},
		combat.Ability{ID: "singing", Name: "Singing", School: "holy", Target: "self", GCD: &zero, CastTime: 3},
		combat.Ability{ID: "punch", Name: "Punch", School: "physical", Target: "self", GCD: &zero, Range: combat.Distance{Melee: true}})
	return h, p, c
}

func TestStunStopsEverythingUntilItEnds(t *testing.T) {
	h, p, c := controlled(t, "stun")
	use(t, p, "singing")
	pass(h, c, 0.1)
	heard(p)
	p.fight.vitals.Statuses[statusKey{"held", p.ID()}] = &activeStatus{def: p.fight.class.Status("held"), class: p.fight.class.ID, since: h.now(), until: h.now().Add(seconds(5)), stacks: 1, uses: 1}
	pass(h, c, 0.1)
	got := heard(p, "controls", "speed", "stopped")
	if len(got) != 3 {
		t.Fatalf("heard %v", got)
	}
	if p.fight.cast != nil {
		t.Fatal("the cast went on")
	}
	if p.motion.slowed != -1 {
		t.Fatalf("slowed = %g", p.motion.slowed)
	}
	use(t, p, "punch")
	pass(h, c, 0.05)
	refusal(t, p, "you're stunned")
	found := false
	for _, s := range p.layer.fighterState(p, h.now()) {
		found = found || s == "stunned"
	}
	if !found {
		t.Fatal("not stunned as far as conditions go")
	}
	pass(h, c, 5.1)
	if got := heard(p, "controls"); len(got) != 1 || got[0]["controls"] != nil {
		t.Fatalf("after it ended: %v", got)
	}
	if p.motion.slowed != 0 {
		t.Fatalf("slowed = %g after", p.motion.slowed)
	}
	use(t, p, "punch")
	pass(h, c, 0.05)
	if got := heard(p, "refused"); len(got) != 0 {
		t.Fatalf("refused = %v", got)
	}
}

func TestRootHoldsYouStillButYouCanAct(t *testing.T) {
	h, p, c := controlled(t, "root")
	use(t, p, "meheld")
	pass(h, c, 0.1)
	if p.motion.slowed != -1 {
		t.Fatalf("slowed = %g", p.motion.slowed)
	}
	heard(p)
	use(t, p, "sing")
	pass(h, c, 0.05)
	if got := heard(p, "refused"); len(got) != 0 {
		t.Fatalf("refused = %v", got)
	}
}

func TestSilenceStopsHolyCastsNotFists(t *testing.T) {
	h, p, c := controlled(t, "silence")
	use(t, p, "meheld")
	pass(h, c, 0.05)
	use(t, p, "singing")
	pass(h, c, 0.05)
	refusal(t, p, "you're silenced")
	use(t, p, "punch")
	pass(h, c, 0.05)
	if got := heard(p, "refused"); len(got) != 0 {
		t.Fatalf("refused = %v", got)
	}
}

func TestDamageBreaksFear(t *testing.T) {
	h, p, c := controlled(t, "fear")
	use(t, p, "itheld")
	pass(h, c, 0.05)
	if held(p, "held") == nil {
		t.Fatal("it never landed")
	}
	p.layer.harm(p, &p.layer.dummies[0].vitals, 1, &hit{}, h.now())
	if held(p, "held") != nil {
		t.Fatal("damage didn't break it")
	}
}

func TestDisarmStopsSwings(t *testing.T) {
	h, p, c := controlled(t, "disarm")
	use(t, p, "meheld")
	pass(h, c, 0.05)
	if err := p.Handle([]byte(`{"type":"attack","target":-1}`)); err != nil {
		t.Fatal(err)
	}
	heard(p)
	pass(h, c, 3)
	if got := heard(p, "swung"); len(got) != 0 {
		t.Fatalf("swung %v", got)
	}
}

// shielded is a fight where the player can put each of these statuses on itself or the dummy, and
// has something to do to a unit that holds one.
func shielded(t *testing.T, statuses ...combat.Status) (*Hub, *Player, *float64) {
	t.Helper()
	zero := 0.0
	h, p, c := dispelling(t, statuses, combat.Effect{Type: "dispel", Affects: "self"})
	p.fight.class.Statuses = append(p.fight.class.Statuses, combat.Status{ID: "ill", Name: "Ill", Kind: "debuff", Duration: 9})
	p.fight.class.Abilities = append(p.fight.class.Abilities,
		combat.Ability{ID: "zapit", Name: "Zap", School: "holy", Target: "enemy", GCD: &zero, Range: combat.Distance{Feet: 100}, Effects: []combat.Effect{{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 9, Max: 9}}}},
		combat.Ability{ID: "coldit", Name: "Cold", School: "frost", Target: "enemy", GCD: &zero, Range: combat.Distance{Feet: 100}, Effects: []combat.Effect{{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 9, Max: 9}}}},
		combat.Ability{ID: "sick", Name: "Sick", Target: "enemy", GCD: &zero, Range: combat.Distance{Feet: 100}, Effects: []combat.Effect{{Type: "status", Affects: "target", Status: "ill"}}})
	return h, p, c
}

func immune(s combat.StatusEffect) combat.Status {
	s.Type = "immune"
	return combat.Status{ID: "ward", Name: "Ward", Kind: "buff", Effects: []combat.StatusEffect{s}}
}

func TestImmuneToDamageFromSchools(t *testing.T) {
	h, p, c := shielded(t, immune(combat.StatusEffect{Schools: []string{"holy"}}))
	use(t, p, "itward")
	pass(h, c, 0.05)
	d := p.layer.dummies[0]
	was := d.Health
	heard(p)
	use(t, p, "zapit")
	pass(h, c, 0.05)
	if d.Health != was {
		t.Fatal("holy got through")
	}
	if got := heard(p, "hit"); len(got) != 1 || got[0]["avoided"] != "immune" || got[0]["missed"] != true {
		t.Fatalf("hits = %v", got)
	}
	use(t, p, "coldit")
	pass(h, c, 0.05)
	if d.Health == was {
		t.Fatal("frost didn't")
	}
}

func TestImmuneToHarmfulStatuses(t *testing.T) {
	for _, e := range []combat.StatusEffect{{Harmful: true}, {All: true}} {
		h, p, c := shielded(t, immune(e))
		use(t, p, "itward")
		pass(h, c, 0.05)
		heard(p)
		use(t, p, "sick")
		pass(h, c, 0.05)
		if held(p, "ill") != nil {
			t.Fatalf("%+v: it landed", e)
		}
		if got := heard(p, "hit"); len(got) != 1 || got[0]["avoided"] != "immune" {
			t.Fatalf("%+v: hits = %v", e, got)
		}
	}
}

func TestImmuneToControls(t *testing.T) {
	half := 0.5
	h, p, c := shielded(t, immune(combat.StatusEffect{Controls: []string{"stun", "slow"}}),
		combat.Status{ID: "daze", Name: "Daze", Kind: "buff", Effects: []combat.StatusEffect{{Type: "control", Control: "stun"}}},
		combat.Status{ID: "drag", Name: "Drag", Kind: "buff", Effects: []combat.StatusEffect{{Type: "stat", Stat: "movementSpeed", Multiply: &half}}})
	use(t, p, "itward")
	pass(h, c, 0.05)
	use(t, p, "itdaze")
	use(t, p, "itdrag")
	pass(h, c, 0.05)
	if held(p, "daze") != nil || held(p, "drag") != nil {
		t.Fatal("they landed")
	}
	// A stun you've already got doesn't count once you're immune.
	use(t, p, "medaze")
	pass(h, c, 0.05)
	if got := p.layer.controlsOn(&p.fight.vitals); len(got) != 1 {
		t.Fatalf("controls = %v", got)
	}
	use(t, p, "meward")
	p.fight.vitals.Statuses[statusKey{"ward", p.ID()}] = &activeStatus{def: p.fight.class.Status("ward"), class: p.fight.class.ID, since: h.now(), stacks: 1, uses: 1}
	if got := p.layer.controlsOn(&p.fight.vitals); len(got) != 0 {
		t.Fatalf("controls = %v", got)
	}
}

func TestImmuneToInterruptAndKnockback(t *testing.T) {
	zero := 0.0
	ward := immune(combat.StatusEffect{Controls: []string{"interrupt", "knockback"}})
	h, p, other, c := two(t, []combat.Status{ward},
		combat.Ability{ID: "guard", Name: "Guard", Target: "self", GCD: &zero, Effects: []combat.Effect{{Type: "status", Affects: "self", Status: "ward"}}},
		combat.Ability{ID: "longcast", Name: "Long", School: "frost", Target: "self", GCD: &zero, CastTime: 5},
		combat.Ability{ID: "hush", Name: "Hush", Target: "ally", GCD: &zero, Range: combat.Distance{Feet: 100}, Effects: []combat.Effect{{Type: "interrupt", Affects: "target", Lockout: 4}}},
		combat.Ability{ID: "shove", Name: "Shove", Target: "ally", GCD: &zero, Range: combat.Distance{Feet: 100}, Effects: []combat.Effect{{Type: "move", Affects: "target", Kind: "knockback"}}})
	use(t, other, "guard")
	pass(h, c, 0.05)
	use(t, other, "longcast")
	pass(h, c, 0.05)
	useOn(t, p, "hush", other.ID())
	pass(h, c, 0.05)
	if other.fight.cast == nil {
		t.Fatal("the cast stopped")
	}
	was := other.state.At
	useOn(t, p, "shove", other.ID())
	pass(h, c, 0.05)
	if other.state.At != was {
		t.Fatal("it moved")
	}
}

func TestUntargetable(t *testing.T) {
	gone := func(e combat.StatusEffect) combat.Status {
		e.Type = "untargetable"
		return combat.Status{ID: "gone", Name: "Gone", Kind: "buff", Effects: []combat.StatusEffect{e}}
	}
	h, p, c := shielded(t, gone(combat.StatusEffect{}))
	use(t, p, "itgone")
	pass(h, c, 0.1)
	if got := heard(p, "targetable"); len(got) != 1 || got[0]["targetable"] != false || got[0]["id"] != -1.0 {
		t.Fatalf("targetable = %v", got)
	}
	use(t, p, "zapit")
	pass(h, c, 0.05)
	refusal(t, p, "you can't target that")

	h, p, c = shielded(t, gone(combat.StatusEffect{AfterSeconds: 2}))
	use(t, p, "itgone")
	pass(h, c, 0.1)
	use(t, p, "zapit")
	pass(h, c, 0.05)
	if got := heard(p, "refused"); len(got) != 0 {
		t.Fatalf("too soon: %v", got)
	}
	pass(h, c, 2)
	use(t, p, "zapit")
	pass(h, c, 0.05)
	refusal(t, p, "you can't target that")

	h, p, c = shielded(t, gone(combat.StatusEffect{OnlyBelow: 50}))
	use(t, p, "itgone")
	pass(h, c, 0.1)
	use(t, p, "zapit")
	pass(h, c, 0.05)
	if got := heard(p, "refused"); len(got) != 0 {
		t.Fatalf("at full health: %v", got)
	}
	p.layer.dummies[0].Health = 10
	pass(h, c, 0.1)
	use(t, p, "zapit")
	pass(h, c, 0.05)
	refusal(t, p, "you can't target that")
}

func TestHasteShortensTheGCDAndCooldownsAsTheAbilitySays(t *testing.T) {
	no := false
	fast := combat.Status{ID: "fast", Name: "Fast", Kind: "buff", Effects: []combat.StatusEffect{{Type: "stat", Stat: "haste", Add: 100}}}
	h, p, c := dispelling(t, []combat.Status{fast}, combat.Effect{Type: "dispel", Affects: "self"})
	p.fight.class.Abilities = append(p.fight.class.Abilities,
		combat.Ability{ID: "plain", Name: "Plain", Target: "self", GCD: &[]float64{2}[0], Cooldown: 10},
		combat.Ability{ID: "fixed", Name: "Fixed", Target: "self", GCD: &[]float64{2}[0], GCDHasted: &no},
		combat.Ability{ID: "cools", Name: "Cools", Target: "self", GCD: &[]float64{0}[0], Cooldown: 10, CooldownHasted: true})
	use(t, p, "mefast")
	pass(h, c, 0.05)
	heard(p)
	use(t, p, "plain")
	pass(h, c, 0.05)
	got := heard(p, "used", "cooldown")
	if got[0]["gcd"] != 1.0 || got[1]["seconds"] != 10.0 {
		t.Fatalf("plain: %v", got)
	}
	pass(h, c, 1)
	use(t, p, "fixed")
	pass(h, c, 0.05)
	if got := heard(p, "used"); got[0]["gcd"] != 2.0 {
		t.Fatalf("fixed: %v", got)
	}
	use(t, p, "cools")
	pass(h, c, 0.05)
	if got := heard(p, "cooldown"); got[0]["seconds"] != 5.0 {
		t.Fatalf("cools: %v", got)
	}
}

// spender is a fight with a resource, 10 of it to hand.
func spender(t *testing.T, abilities ...combat.Ability) (*Hub, *Player, *float64) {
	t.Helper()
	h, p, c := fighting(t)
	zero := 0.0
	p.fight.class.Resources = append(p.fight.class.Resources, combat.Resource{Key: "combo", Kind: "points", Max: 10})
	p.fight.resources["combo"] = 10
	for _, a := range abilities {
		a.GCD, a.Range = &zero, combat.Distance{Feet: 100}
		if a.Target == "" {
			a.Target = "enemy"
		}
		p.fight.class.Abilities = append(p.fight.class.Abilities, a)
	}
	return h, p, c
}

func dealing(perSpent float64) combat.Effect {
	return combat.Effect{Type: "damage", Affects: "target", Amount: combat.Amount{PerSpent: &combat.Amount{Min: perSpent, Max: perSpent}}}
}

func TestAnAllCostSpendsAllOfIt(t *testing.T) {
	h, p, c := spender(t, combat.Ability{ID: "finish", Name: "Finish", Cost: []combat.Cost{{Resource: "combo", Amount: 1, All: true}}, Effects: []combat.Effect{dealing(10)}})
	d := p.layer.dummies[0]
	was := d.Health
	p.fight.resources["combo"] = 4
	use(t, p, "finish")
	pass(h, c, 0.5)
	if got := was - d.Health; got != 40 {
		t.Fatalf("dealt %g for 4 points", got)
	}
	if p.fight.resources["combo"] != 0 {
		t.Fatalf("%g left", p.fight.resources["combo"])
	}
	heard(p)
	use(t, p, "finish")
	pass(h, c, 0.05)
	refusal(t, p, "not enough combo")
}

func TestAnUpToCostSpendsWhatItCan(t *testing.T) {
	grown := combat.Effect{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 10, Max: 10}, ByExtraSpent: 3}
	h, p, c := spender(t, combat.Ability{ID: "bite", Name: "Bite", Cost: []combat.Cost{{Resource: "combo", Amount: 2, UpTo: 6}}, Effects: []combat.Effect{grown}})
	d := p.layer.dummies[0]
	was := d.Health
	p.fight.resources["combo"] = 4 // 2 past its 2, of the 4 it could
	use(t, p, "bite")
	pass(h, c, 0.5)
	if got := was - d.Health; got != 20 {
		t.Fatalf("dealt %g", got)
	}
	if p.fight.resources["combo"] != 0 {
		t.Fatalf("%g left", p.fight.resources["combo"])
	}
}

func TestACostOnlyCountsWhileItsConditionsHold(t *testing.T) {
	have := combat.Condition{Status: "free", On: "self"}
	h, p, c := spender(t, combat.Ability{ID: "maybe", Name: "Maybe", Cost: []combat.Cost{{Resource: "combo", Amount: 3, When: []combat.Condition{{Not: &have}}}}})
	use(t, p, "maybe")
	pass(h, c, 0.05)
	if p.fight.resources["combo"] != 7 {
		t.Fatalf("%g left", p.fight.resources["combo"])
	}
	p.fight.class.Statuses = append(p.fight.class.Statuses, combat.Status{ID: "free", Name: "Free"})
	p.fight.vitals.Statuses[statusKey{"free", p.ID()}] = &activeStatus{def: p.fight.class.Status("free"), since: h.now(), stacks: 1, uses: 1}
	use(t, p, "maybe")
	pass(h, c, 0.05)
	if p.fight.resources["combo"] != 7 {
		t.Fatalf("%g left with it free", p.fight.resources["combo"])
	}
}

func TestChannelCostsEndItWhenYouCantPay(t *testing.T) {
	for name, a := range map[string]combat.Ability{
		"per tick":   {Channel: &combat.Channel{Duration: 5, Ticks: 5, CostPerTick: &combat.Cost{Resource: "combo", Amount: 2}}},
		"per second": {Channel: &combat.Channel{Duration: 5, Ticks: 5}, Cost: []combat.Cost{{Resource: "combo", PerSecond: 2}}},
	} {
		a.ID, a.Name, a.Target = "sipper", "Drain", "self"
		a.Effects = []combat.Effect{{Type: "resource", Affects: "self", Resource: "tally", Amount: combat.Amount{Min: 1, Max: 1}}}
		h, p, c := spender(t, a)
		p.fight.class.Resources = append(p.fight.class.Resources, combat.Resource{Key: "tally", Kind: "points", Max: 100})
		p.fight.resources["combo"] = 5
		use(t, p, "sipper")
		pass(h, c, 2.5)
		if got := p.fight.resources["tally"]; got != 2 {
			t.Fatalf("%s: %g ticks in 2.5 s", name, got)
		}
		if p.fight.cast == nil {
			t.Fatalf("%s: stopped early", name)
		}
		pass(h, c, 1)
		if p.fight.cast != nil {
			t.Fatalf("%s: went on unpaid", name)
		}
		if got := p.fight.resources["combo"]; got != 1 {
			t.Fatalf("%s: %g left", name, got)
		}
	}
}

func TestDurationsAndStatsGrowWithWhatWasSpent(t *testing.T) {
	fury := combat.Status{ID: "fury", Name: "Fury", Duration: 4, Effects: []combat.StatusEffect{{Type: "stat", Stat: "strength", AddPerSpent: 3}}}
	h, p, c := spender(t, combat.Ability{ID: "rouse", Name: "Rouse", Target: "self", Cost: []combat.Cost{{Resource: "combo", Amount: 1, All: true}}, Effects: []combat.Effect{{Type: "status", Affects: "self", Status: "fury", DurationPerSpent: 2}}})
	p.fight.class.Statuses = append(p.fight.class.Statuses, fury)
	before := p.layer.statsOf(&p.fight.vitals, nil, h.now()).Strength
	p.fight.resources["combo"] = 5
	use(t, p, "rouse")
	pass(h, c, 0.05)
	held := p.fight.vitals.Statuses[statusKey{"fury", p.ID()}]
	if held == nil {
		t.Fatal("no status")
	}
	if got := held.until.Sub(held.since).Seconds(); got != 14 {
		t.Fatalf("lasts %g", got)
	}
	if got := p.layer.statsOf(&p.fight.vitals, nil, h.now()).Strength - before; got != 15 {
		t.Fatalf("strength up %g", got)
	}
}

func TestSpentAsCountsWhatAModifySays(t *testing.T) {
	ramp := combat.Status{ID: "ramp", Name: "Ramp", Effects: []combat.StatusEffect{{Type: "modify", Abilities: []string{"finish"}, SpentAs: 7}}}
	h, p, c := spender(t, combat.Ability{ID: "finish", Name: "Finish", Cost: []combat.Cost{{Resource: "combo", Amount: 1, All: true}}, Effects: []combat.Effect{dealing(10)}})
	p.fight.class.Statuses = append(p.fight.class.Statuses, ramp)
	p.fight.vitals.Statuses[statusKey{"ramp", p.ID()}] = &activeStatus{def: p.fight.class.Status("ramp"), since: h.now(), stacks: 1, uses: 1}
	d := p.layer.dummies[0]
	was := d.Health
	p.fight.resources["combo"] = 2
	use(t, p, "finish")
	pass(h, c, 0.5)
	if got := was - d.Health; got != 70 {
		t.Fatalf("dealt %g", got)
	}
}

func TestEffectChance(t *testing.T) {
	half := 0.25
	h, p, c := spender(t, combat.Ability{ID: "lucky", Name: "Lucky", Effects: []combat.Effect{{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 9, Max: 9}, Chance: &half}}},
		combat.Ability{ID: "earned", Name: "Earned", Cost: []combat.Cost{{Resource: "combo", Amount: 4}}, Effects: []combat.Effect{{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 9, Max: 9}, Chance: &half, ChancePerSpent: 0.1}}})
	d := p.layer.dummies[0]
	was := d.Health
	use(t, p, "lucky") // the rolls are 0.5
	pass(h, c, 0.5)
	if d.Health != was {
		t.Fatal("it landed at a 25% chance")
	}
	use(t, p, "earned")
	pass(h, c, 0.5)
	if d.Health != was-9 {
		t.Fatal("it missed at 65%")
	}
}

// hitting is a fight with one ability, dealing whatever this effect does to the dummy.
func hitting(t *testing.T, e combat.Effect) (*Hub, *Player, *float64, *dummy) {
	t.Helper()
	zero := 0.0
	h, p, c := fighting(t)
	e.Type, e.Affects = "damage", "target"
	p.fight.class.Abilities = append(p.fight.class.Abilities, combat.Ability{ID: "bonk", Name: "Bonk", Target: "enemy", GCD: &zero, Range: combat.Distance{Feet: 100}, Effects: []combat.Effect{e}})
	return h, p, c, p.layer.dummies[0]
}

func dealt(t *testing.T, h *Hub, p *Player, c *float64, d *dummy) float64 {
	t.Helper()
	was := d.Health
	use(t, p, "bonk")
	pass(h, c, 0.5)
	return was - d.Health
}

func TestCritRules(t *testing.T) {
	flat := combat.Amount{Min: 100, Max: 100}
	base := func(e combat.Effect) float64 {
		e.Amount = flat
		h, p, c, d := hitting(t, e)
		return dealt(t, h, p, c, d)
	}
	plain := base(combat.Effect{})
	if got := base(combat.Effect{AlwaysCrit: true, CritMultiplier: 3}); got != plain*3 {
		t.Fatalf("always crits at 3x: %g, plain %g", got, plain)
	}
	below := 150.0
	if got := base(combat.Effect{AlwaysCritWhen: []combat.Condition{{Health: "target", Below: &below}}, CritMultiplier: 2}); got != plain*2 {
		t.Fatalf("crit when: %g, plain %g", got, plain)
	}
	if got := base(combat.Effect{CritMultiplier: 3}); got != plain {
		t.Fatalf("a multiplier alone doesn't crit: %g", got)
	}
}

func TestAmountLimits(t *testing.T) {
	least := combat.Amount{Min: 50, Max: 50}
	most := combat.Amount{Min: 5, Max: 5}
	h, p, c, d := hitting(t, combat.Effect{Amount: combat.Amount{Min: 1, Max: 1, Minimum: &least}})
	if got := dealt(t, h, p, c, d); got < 45 {
		t.Fatalf("minimum: %g", got)
	}
	h, p, c, d = hitting(t, combat.Effect{Amount: combat.Amount{Min: 100, Max: 100, Maximum: &most}})
	if got := dealt(t, h, p, c, d); got > 6 {
		t.Fatalf("maximum: %g", got)
	}
}

func TestByMissingHealth(t *testing.T) {
	h, p, c, d := hitting(t, combat.Effect{Amount: combat.Amount{Min: 100, Max: 100, ByMissingHealth: &combat.ByMissingHealth{UpTo: 3}}})
	full := dealt(t, h, p, c, d)
	d.Health = d.MaxHealth / 2
	if got := dealt(t, h, p, c, d); got < full*1.9 {
		t.Fatalf("at half health %g, at full %g", got, full)
	}
}

func TestShareOfWhatTheFightKept(t *testing.T) {
	h, p, c, d := hitting(t, combat.Effect{Amount: combat.Amount{ShareOf: &combat.ShareOf{Of: "recentDamage", Share: 0.5, Seconds: 5}}})
	p.fight.vitals.Health = p.fight.vitals.MaxHealth
	p.layer.harm(p, &p.fight.vitals, 40, &hit{}, h.now())
	got := dealt(t, h, p, c, d)
	if got < 15 || got > 25 {
		t.Fatalf("dealt %g for half of 40", got)
	}
	pass(h, c, 6)
	if got := dealt(t, h, p, c, d); got != 0 {
		t.Fatalf("dealt %g after it faded", got)
	}
}

func TestShareOfTheEffectBefore(t *testing.T) {
	zero := 0.0
	h, p, c := fighting(t)
	p.fight.class.Abilities = append(p.fight.class.Abilities, combat.Ability{ID: "twice", Name: "Twice", Target: "enemy", GCD: &zero, Range: combat.Distance{Feet: 100}, Effects: []combat.Effect{
		{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 100, Max: 100}},
		{Type: "heal", Affects: "self", Amount: combat.Amount{ShareOf: &combat.ShareOf{Of: "effect", Share: 0.5}}},
	}})
	p.fight.vitals.Health = 1
	use(t, p, "twice")
	pass(h, c, 0.5)
	if got := p.fight.vitals.Health; got < 40 {
		t.Fatalf("health %g", got)
	}
}

func TestPerCount(t *testing.T) {
	mark := combat.Status{ID: "mark", Name: "Mark", Duration: 20}
	h, p, c := consuming(t, mark, withEffects("count", combat.Effect{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 10, Max: 10}, PerCount: &combat.PerCount{StatusStacks: "mark", Max: 2}}))
	use(t, p, "put")
	pass(h, c, 0.1)
	d := p.layer.dummies[0]
	held(p, "mark").stacks = 5
	was := d.Health
	use(t, p, "count")
	pass(h, c, 0.1)
	if got := was - d.Health; got < 19 || got > 21 {
		t.Fatalf("dealt %g, want 2 counts of 10", got)
	}
}

func TestAbsorbSoaksThenEnds(t *testing.T) {
	ward := combat.Status{ID: "ward", Name: "Ward", Kind: "buff", Effects: []combat.StatusEffect{{Type: "absorb", Amount: combat.Amount{Min: 30, Max: 30}}}}
	h, p, c := consuming(t, ward, withEffects("slap", combat.Effect{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 20, Max: 20}}))
	use(t, p, "put")
	pass(h, c, 0.1)
	d := p.layer.dummies[0]
	if got := heard(p, "absorb"); len(got) != 1 || got[0]["absorb"] != 30.0 {
		t.Fatalf("absorb = %v", got)
	}
	was := d.Health
	use(t, p, "slap")
	pass(h, c, 0.5)
	hits := heard(p, "hit")
	last := hits[len(hits)-1]
	if d.Health != was || last["absorbed"] == nil {
		t.Fatalf("first hit: health down %g, %v", was-d.Health, last)
	}
	use(t, p, "slap")
	pass(h, c, 0.5)
	if held(p, "ward") != nil {
		t.Fatal("it stayed once spent")
	}
	if got := was - d.Health; got < 8 {
		t.Fatalf("second hit let %g through", got)
	}
}

func TestStoreKeepsAShareForLater(t *testing.T) {
	keep := combat.Status{ID: "keep", Name: "Keep", Kind: "buff", Duration: 2, Effects: []combat.StatusEffect{
		{Type: "store", On: "dealDamage", Share: 0.5},
		{Type: "trigger", On: "statusEnds", Effect: &combat.Effect{Type: "heal", Affects: "caster", Amount: combat.Amount{ShareOf: &combat.ShareOf{Of: "stored", Share: 1}}}},
	}}
	h, p, c := consuming(t, keep, withEffects("slap", combat.Effect{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 40, Max: 40}}))
	use(t, p, "put")
	pass(h, c, 0.1)
	use(t, p, "slap")
	pass(h, c, 0.5)
	if s := held(p, "keep"); s == nil || s.stored < 15 {
		t.Fatalf("holding %+v", s)
	}
	p.fight.vitals.Health = 1
	pass(h, c, 2)
	if got := p.fight.vitals.Health; got < 15 {
		t.Fatalf("health %g after it ended", got)
	}
}

func TestWhoAnEffectReaches(t *testing.T) {
	zero := 0.0
	h, p, c := fighting(t)
	world := p.layer
	second := *world.dummies[0]
	second.ID, second.state.ID = -2, -2
	second.Statuses = map[statusKey]*activeStatus{}
	world.dummies = append(world.dummies, &second)
	first := world.dummies[0]
	first.state.At = p.state.At
	second.state.At = [3]float64{p.state.At[0] + 5, p.state.At[1], p.state.At[2]}
	first.Health, second.Health = 900, 500
	p.fight.class.Statuses = append(p.fight.class.Statuses, combat.Status{ID: "tag", Name: "Tag", Duration: 10})
	effect := func(id string, e combat.Effect) {
		e.Type, e.Affects, e.Amount = "damage", "enemies", combat.Amount{Min: 10, Max: 10}
		p.fight.class.Abilities = append(p.fight.class.Abilities, combat.Ability{ID: id, Name: id, Target: "enemy", GCD: &zero, Range: combat.Distance{Feet: 100}, Effects: []combat.Effect{e}})
	}
	effect("near1", combat.Effect{Radius: 50, Max: 1})
	effect("low1", combat.Effect{Radius: 50, Max: 1, Prefers: "lowestHealth"})
	effect("far1", combat.Effect{Radius: 50, Max: 1, Prefers: "farthest"})
	effect("butone", combat.Effect{Radius: 50, ExceptTarget: true})
	effect("both", combat.Effect{Radius: 50, Split: true})
	effect("less", combat.Effect{Radius: 50, Others: 0.5})
	check := func(id string, wantFirst, wantSecond float64) {
		t.Helper()
		a, b := first.Health, second.Health
		use(t, p, id)
		pass(h, c, 0.5)
		x, y := a-first.Health, b-second.Health
		if math.Abs(x-wantFirst) > 1.5 || math.Abs(y-wantSecond) > 1.5 {
			t.Fatalf("%s: dealt %g and %g, want %g and %g", id, x, y, wantFirst, wantSecond)
		}
	}
	check("near1", 10, 0)
	check("low1", 0, 10)
	check("far1", 0, 10)
	check("butone", 0, 10)
	check("both", 5, 5)
	check("less", 10, 5)
}

func TestExtraTargetsSpill(t *testing.T) {
	zero := 0.0
	h, p, c := fighting(t)
	world := p.layer
	second := *world.dummies[0]
	second.ID, second.state.ID = -2, -2
	second.Statuses = map[statusKey]*activeStatus{}
	world.dummies = append(world.dummies, &second)
	first := world.dummies[0]
	second.state.At = first.state.At
	p.fight.class.Abilities = append(p.fight.class.Abilities, combat.Ability{ID: "cleave", Name: "Cleave", Target: "enemy", GCD: &zero, Range: combat.Distance{Feet: 1000},
		Effects:      []combat.Effect{{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 100, Max: 100}}},
		ExtraTargets: &combat.ExtraTargets{Max: 1, Radius: 10, Share: 0.5}})
	a, b := first.Health, second.Health
	use(t, p, "cleave")
	pass(h, c, 0.5)
	x, y := a-first.Health, b-second.Health
	if x == 0 || math.Abs(y-x/2) > 1 {
		t.Fatalf("dealt %g, spilled %g", x, y)
	}
}

func TestWhileCastingDoesntStopTheCast(t *testing.T) {
	h, p, c := spender(t,
		combat.Ability{ID: "longone", Name: "Long", Target: "self", CastTime: 3},
		combat.Ability{ID: "aside", Name: "Aside", Target: "self", WhileCasting: true},
		combat.Ability{ID: "notaside", Name: "Not", Target: "self"})
	use(t, p, "longone")
	pass(h, c, 0.05)
	heard(p)
	use(t, p, "notaside")
	pass(h, c, 0.05)
	refusal(t, p, "you're busy")
	use(t, p, "aside")
	pass(h, c, 0.05)
	if got := heard(p, "refused"); len(got) != 0 {
		t.Fatalf("refused = %v", got)
	}
	if p.fight.cast == nil {
		t.Fatal("the cast stopped")
	}
}

func TestBecomesSwapsWhileItHolds(t *testing.T) {
	form := combat.Status{ID: "form", Name: "Form", Effects: []combat.StatusEffect{{Type: "modify", Abilities: []string{"weakone"}, Becomes: "bigone"}}}
	h, p, c := spender(t,
		combat.Ability{ID: "weakone", Name: "Weak", Effects: []combat.Effect{{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 1, Max: 1}}}},
		combat.Ability{ID: "bigone", Name: "Big", Level: 99, Effects: []combat.Effect{{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 500, Max: 500}}}})
	p.fight.class.Statuses = append(p.fight.class.Statuses, form)
	d := p.layer.dummies[0]
	was := d.Health
	use(t, p, "weakone")
	pass(h, c, 0.5)
	if got := was - d.Health; got > 5 {
		t.Fatalf("before: dealt %g", got)
	}
	p.fight.vitals.Statuses[statusKey{"form", p.ID()}] = &activeStatus{def: p.fight.class.Status("form"), since: h.now(), stacks: 1, uses: 1}
	was = d.Health
	use(t, p, "weakone")
	pass(h, c, 0.5)
	if got := was - d.Health; got < 400 {
		t.Fatalf("after: dealt %g", got)
	}
}

func TestCastAbilityAtOnce(t *testing.T) {
	inner := combat.Ability{ID: "innerone", Name: "Inner", Cost: []combat.Cost{{Resource: "combo", Amount: 3}}, Effects: []combat.Effect{{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 100, Max: 100}}}}
	h, p, c := spender(t, inner,
		combat.Ability{ID: "paid", Name: "Paid", Effects: []combat.Effect{{Type: "castAbility", Affects: "target", Ability: "innerone"}}},
		combat.Ability{ID: "gratis", Name: "Gratis", Effects: []combat.Effect{{Type: "castAbility", Affects: "target", Ability: "innerone", Free: true, Strength: 0.5}}},
		combat.Ability{ID: "selfish", Name: "Selfish", Effects: []combat.Effect{{Type: "castAbility", Affects: "target", Ability: "selfish"}}})
	d := p.layer.dummies[0]
	was := d.Health
	heard(p)
	use(t, p, "paid")
	pass(h, c, 0.5)
	if p.fight.resources["combo"] != 7 {
		t.Fatalf("%g left", p.fight.resources["combo"])
	}
	dealtFull := was - d.Health
	if dealtFull < 90 {
		t.Fatalf("dealt %g", dealtFull)
	}
	if got := heard(p, "used"); len(got) != 2 || got[1]["ability"] != "innerone" {
		t.Fatalf("used = %v", got)
	}
	was = d.Health
	use(t, p, "gratis")
	pass(h, c, 0.5)
	if p.fight.resources["combo"] != 7 {
		t.Fatalf("free cost: %g left", p.fight.resources["combo"])
	}
	if got := was - d.Health; math.Abs(got-dealtFull/2) > 2 {
		t.Fatalf("at half strength dealt %g, %g at full", got, dealtFull)
	}
	use(t, p, "selfish") // it stops on its own
	pass(h, c, 0.1)
}

func TestConditionsOnTheFightSoFar(t *testing.T) {
	two := 2.0
	one := 1
	h, p, c := consuming(t, combat.Status{ID: "mark", Name: "Mark", Duration: 20, Group: "marks"},
		withEffects("gated", combat.Effect{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 1, Max: 1}, When: []combat.Condition{{Holders: "mark", AtLeast: &[]float64{1}[0]}}}),
		withEffects("tooMany", combat.Effect{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 1, Max: 1}, When: []combat.Condition{{Holders: "mark", AtLeast: &two}}}),
		withEffects("oneHit", combat.Effect{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 1, Max: 1}, When: []combat.Condition{{TargetsHitAtLeast: &one}}}),
		withEffects("marked", combat.Effect{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 1, Max: 1}, When: []combat.Condition{{Group: "marks", On: "target"}}}),
		withEffects("weaker", combat.Effect{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 1, Max: 1}, When: []combat.Condition{{TargetHealthBelowMine: true}}}),
		withEffects("spent", combat.Effect{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 1, Max: 1}, When: []combat.Condition{{SpentAtLeast: &two}}}),
		withEffects("afterCrit", combat.Effect{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 1, Max: 1}}, combat.Effect{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 50, Max: 50}, When: []combat.Condition{{Outcome: "crit"}}}))
	d := p.layer.dummies[0]
	check := func(id string, lands bool) {
		t.Helper()
		was := d.Health
		use(t, p, id)
		pass(h, c, 0.5)
		if got := d.Health < was; got != lands {
			t.Fatalf("%s: landed = %v", id, got)
		}
	}
	check("gated", false)
	check("marked", false)
	use(t, p, "put")
	pass(h, c, 0.1)
	check("gated", true)
	check("tooMany", false)
	check("oneHit", true)
	check("marked", true)
	check("weaker", false)
	check("spent", false)
	d.Health = 10
	check("weaker", true)
	d.Health = d.MaxHealth
	was := d.Health
	use(t, p, "afterCrit") // the fight never crits: only the first lands
	pass(h, c, 0.5)
	if got := was - d.Health; got > 5 {
		t.Fatalf("after a hit that didn't crit, dealt %g", got)
	}
}

func TestTransformChangesTheLookWhileItLasts(t *testing.T) {
	bear := combat.Status{ID: "bearform", Name: "Bear", Kind: "buff", Duration: 2, Effects: []combat.StatusEffect{{Type: "transform", Into: "bear"}}}
	h, p, c := dispelling(t, []combat.Status{bear}, combat.Effect{Type: "dispel", Affects: "self"})
	p.fight.class.Units = append(p.fight.class.Units, combat.ClassUnit{ID: "bear", Name: "Bear", Look: []byte(`{"body":"bear"}`)})
	other := enter(t, h, 2)
	h.Tick()
	heard(other)
	use(t, p, "mebearform")
	pass(h, c, 0.1)
	got := heard(other, "look")
	if len(got) != 1 || got[0]["id"] != float64(p.ID()) || got[0]["look"].(map[string]any)["body"] != "bear" {
		t.Fatalf("look = %v", got)
	}
	third := enter(t, h, 3)
	var seen map[string]any
	for seen == nil {
		if m := next(t, third); m["type"] == "snapshot" {
			for _, each := range m["characters"].([]any) {
				if ch := each.(map[string]any); ch["id"] == float64(p.ID()) {
					seen = ch
				}
			}
		}
	}
	if seen["look"].(map[string]any)["body"] != "bear" {
		t.Fatalf("someone coming later sees %v", seen["look"])
	}
	pass(h, c, 2.1)
	if got := heard(other, "look"); len(got) != 1 || got[0]["look"] != nil {
		t.Fatalf("after it ended: %v", got)
	}
}
