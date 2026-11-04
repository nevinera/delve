package game

import (
	"encoding/json"
	"testing"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// mine reads the copies of statuses a player has put on itself.
func mine(p *Player) func(string) *activeStatus {
	return func(id string) *activeStatus { return p.fight.vitals.Statuses[statusKey{id, p.ID()}] }
}

func selfBuff(id string, effects ...combat.Effect) combat.Ability {
	zero := 0.0
	return combat.Ability{ID: id, Name: id, Target: "self", GCD: &zero, Effects: effects}
}

func gaining(id string) combat.Effect {
	return combat.Effect{Type: "status", Affects: "self", Status: id}
}

// lifetimes is a fight where the player has these statuses and abilities.
func lifetimes(t *testing.T, statuses []combat.Status, abilities ...combat.Ability) (*Hub, *Player, *float64) {
	t.Helper()
	h, p, c := fighting(t)
	p.fight.class.Statuses = append(p.fight.class.Statuses, statuses...)
	p.fight.class.Abilities = append(p.fight.class.Abilities, abilities...)
	return h, p, c
}

func TestStacking(t *testing.T) {
	h, p, c := lifetimes(t, []combat.Status{
		{ID: "pile", Name: "Pile", Duration: 10, Stacking: "stack", MaxStacks: 2},
		{ID: "keep", Name: "Keep", Duration: 10, Stacking: "refresh"},
		{ID: "over", Name: "Over", Duration: 10},
	}, selfBuff("pile", gaining("pile")), selfBuff("keep", gaining("keep")), selfBuff("over", gaining("over")))
	on := mine(p)
	for _, want := range []int{1, 2, 2} {
		use(t, p, "pile")
		pass(h, c, 0.1)
		if on("pile").stacks != want {
			t.Fatalf("stacks = %d, want %d", on("pile").stacks, want)
		}
	}
	if got := heard(p, "hit"); got[len(got)-1]["stacks"] != 2.0 {
		t.Fatalf("hit = %v", got[len(got)-1])
	}
	left := func(id string) float64 { return on(id).until.Sub(h.now()).Seconds() }
	for _, id := range []string{"keep", "over"} {
		use(t, p, id)
		pass(h, c, 0.1)
		use(t, p, id)
		pass(h, c, 0.05)
	}
	if got := left("keep"); got < 12.8 || got > 13 {
		t.Fatalf("a refresh with nearly 10 s left came to %g, want about 13", got)
	}
	if got := left("over"); got > 10 {
		t.Fatalf("starting over came to %g", got)
	}
}

func TestLimitTakesItOffTheOldest(t *testing.T) {
	h, p, c := consuming(t, combat.Status{ID: "mark", Name: "Mark", Duration: 60, Limit: 1},
		withEffects("mine", combat.Effect{Type: "status", Affects: "self", Status: "mark"}))
	use(t, p, "put")
	pass(h, c, 0.1)
	use(t, p, "put")
	pass(h, c, 0.1)
	if held(p, "mark") == nil {
		t.Fatal("putting it on the same unit again took it off")
	}
	use(t, p, "mine")
	pass(h, c, 0.1)
	if held(p, "mark") != nil {
		t.Fatal("the first holder kept it")
	}
	if mine(p)("mark") == nil {
		t.Fatal("the second holder didn't get it")
	}
	if got := heard(p, "statusGone"); len(got) != 1 || got[0]["id"] != -1.0 {
		t.Fatalf("statusGone = %v", got)
	}
}

func TestLeashEndsItWhenTheHolderIsTooFar(t *testing.T) {
	h, p, c := consuming(t, combat.Status{ID: "tie", Name: "Tie", Leash: 40})
	use(t, p, "put")
	pass(h, c, 0.1)
	p.state.At[0] += 30
	pass(h, c, 0.1)
	if held(p, "tie") == nil {
		t.Fatal("it ended inside the leash")
	}
	p.state.At[0] += 60
	pass(h, c, 0.1)
	if held(p, "tie") != nil {
		t.Fatal("it stayed past the leash")
	}
}

func TestAGroupHoldsOneStatus(t *testing.T) {
	h, p, c := lifetimes(t, []combat.Status{
		{ID: "bear", Name: "Bear", Group: "form"},
		{ID: "cat", Name: "Cat", Group: "form"},
	}, selfBuff("bear", gaining("bear")), selfBuff("cat", gaining("cat")))
	use(t, p, "bear")
	pass(h, c, 0.1)
	use(t, p, "cat")
	pass(h, c, 0.1)
	on := mine(p)
	if on("bear") != nil || on("cat") == nil {
		t.Fatalf("statuses = %v", p.fight.vitals.Statuses)
	}
}

func TestBreaksOn(t *testing.T) {
	h, p, c := lifetimes(t, []combat.Status{
		{ID: "food", Name: "Food", BreaksOn: []string{"move", "damage"}},
		{ID: "hide", Name: "Hide", BreaksOn: []string{"action"}, KeptBy: &combat.KeptBy{Abilities: []string{"sneak"}, Tags: []string{"quiet"}}},
		{ID: "wait", Name: "Wait", BreaksOn: []string{"action"}},
	},
		selfBuff("food", gaining("food")),
		selfBuff("hide", gaining("hide")),
		selfBuff("wait", gaining("wait")),
		selfBuff("sneak"),
		combat.Ability{ID: "hush", Name: "hush", Target: "self", Tags: []string{"quiet"}, GCD: new(float64)},
		selfBuff("loud"),
		selfBuff("ouch", combat.Effect{Type: "damage", Affects: "self", Amount: combat.Amount{Min: 1, Max: 1}}),
	)
	on := mine(p)

	use(t, p, "food")
	pass(h, c, 0.1)
	p.Handle([]byte(`{"type":"move","at":[0,0,0],"yaw":0,"move":{"forward":0}}`))
	if on("food") == nil {
		t.Fatal("standing still broke it")
	}
	use(t, p, "ouch")
	pass(h, c, 0.5)
	if on("food") != nil {
		t.Fatal("damage didn't break it")
	}
	use(t, p, "food")
	pass(h, c, 0.1)
	p.state.Move = Move{Forward: 1}
	p.layer.mu.Lock()
	p.layer.interruptMoving(p)
	p.layer.mu.Unlock()
	if on("food") != nil {
		t.Fatal("moving didn't break it")
	}
	p.state.Move = Move{}

	use(t, p, "hide")
	pass(h, c, 0.1)
	for _, kept := range []string{"sneak", "hush"} {
		use(t, p, kept)
		pass(h, c, 0.1)
		if on("hide") == nil {
			t.Fatalf("%s broke it", kept)
		}
	}
	use(t, p, "loud")
	pass(h, c, 0.1)
	if on("hide") != nil {
		t.Fatal("another ability didn't break it")
	}
}

func TestASwingBreaksActionStatusesButNotKeptOnes(t *testing.T) {
	h, p, c := lifetimes(t, []combat.Status{
		{ID: "hide", Name: "Hide", BreaksOn: []string{"action"}},
		{ID: "form", Name: "Form", BreaksOn: []string{"action"}, KeptBy: &combat.KeptBy{Tags: []string{"form"}}},
	}, combat.Ability{ID: "both", Name: "both", Target: "self", GCD: new(float64), Effects: []combat.Effect{gaining("hide"), gaining("form")}})
	use(t, p, "both")
	pass(h, c, 0.1)
	p.state.Yaw, p.state.At = 0, p.layer.dummies[0].state.At
	if err := p.Handle([]byte(`{"type":"attack","target":-1}`)); err != nil {
		t.Fatal(err)
	}
	pass(h, c, 0.1)
	on := mine(p)
	if on("hide") != nil || on("form") == nil {
		t.Fatalf("statuses = %v, swung %d", p.fight.vitals.Statuses, len(heard(p, "swung")))
	}
}

func TestConsumedBy(t *testing.T) {
	h, p, c := lifetimes(t, []combat.Status{
		{ID: "once", Name: "Once", ConsumedBy: &combat.ConsumedBy{Abilities: []string{"blast"}}},
		{ID: "thrice", Name: "Thrice", ConsumedBy: &combat.ConsumedBy{Tag: "spell", Uses: 3}},
		{ID: "pile", Name: "Pile", Stacking: "stack", ConsumedBy: &combat.ConsumedBy{Tag: "spell", Stacks: 2}},
		{ID: "self", Name: "Self", ConsumedBy: &combat.ConsumedBy{Abilities: []string{"selfish"}}},
	},
		selfBuff("gain", gaining("once"), gaining("thrice"), gaining("pile"), gaining("pile"), gaining("pile")),
		selfBuff("selfish", gaining("self")),
		combat.Ability{ID: "blast", Name: "blast", Target: "self", GCD: new(float64), Tags: []string{"spell"}},
		selfBuff("other"),
	)
	on := mine(p)
	use(t, p, "gain")
	pass(h, c, 0.1)
	use(t, p, "other")
	pass(h, c, 0.1)
	if on("once") == nil {
		t.Fatal("another ability used it")
	}
	use(t, p, "blast")
	pass(h, c, 0.1)
	if on("once") != nil {
		t.Fatal("the ability didn't use it")
	}
	if on("thrice") == nil || on("thrice").uses != 2 {
		t.Fatalf("thrice = %+v", on("thrice"))
	}
	if on("pile") == nil || on("pile").stacks != 1 {
		t.Fatalf("pile = %+v", on("pile"))
	}
	use(t, p, "blast")
	pass(h, c, 0.1)
	if on("pile") != nil {
		t.Fatal("the stacks ran out but it stayed")
	}
	use(t, p, "blast")
	pass(h, c, 0.1)
	if on("thrice") != nil {
		t.Fatal("three uses didn't end it")
	}
	use(t, p, "selfish")
	pass(h, c, 0.1)
	if on("self") == nil {
		t.Fatal("the use that put it on spent it")
	}
}

// A use's own effects still see a status it's about to spend.
func TestAStatusLastsThroughTheUseThatSpendsIt(t *testing.T) {
	h, p, c := lifetimes(t, []combat.Status{
		{ID: "ready", Name: "Ready", ConsumedBy: &combat.ConsumedBy{Abilities: []string{"strike"}}},
	}, selfBuff("gain", gaining("ready")), selfBuff("strike", combat.Effect{
		Type: "heal", Affects: "self", Amount: combat.Amount{Min: 1, Max: 1},
		When: []combat.Condition{{Status: "ready", On: "self"}},
	}))
	use(t, p, "gain")
	pass(h, c, 0.1)
	heard(p, "hit")
	use(t, p, "strike")
	pass(h, c, 0.5)
	if got := heard(p, "hit"); len(got) != 1 {
		t.Fatalf("hits = %v", got)
	}
	if mine(p)("ready") != nil {
		t.Fatal("it wasn't spent")
	}
}

func TestStatusFieldsParse(t *testing.T) {
	var s combat.Status
	if err := json.Unmarshal([]byte(`{"id":"a","stacking":"stack","maxStacks":3,"limit":1,"leash":40,"group":"g","breaksOn":["move"],"keptBy":{"tags":["t"]},"consumedBy":{"tag":"t","uses":2,"stacks":1},"effects":[{"type":"stat","amount":7},{"type":"periodic","every":2,"does":"damage","amount":{"base":3}}]}`), &s); err != nil {
		t.Fatal(err)
	}
	if s.MaxStacks != 3 || s.Leash != 40 || s.ConsumedBy.Uses != 2 || s.Effects[1].Every != 2 {
		t.Fatalf("status = %+v", s)
	}
}

// two is a fight between a player with these abilities and a second one of the same class.
func two(t *testing.T, statuses []combat.Status, abilities ...combat.Ability) (*Hub, *Player, *Player, *float64) {
	t.Helper()
	h, p, c := fighting(t)
	other := enter(t, h, 2)
	// Both play the one class, so what's added to it reaches them both.
	p.fight.class.Statuses = append(p.fight.class.Statuses, statuses...)
	p.fight.class.Abilities = append(p.fight.class.Abilities, abilities...)
	if other.fight.class != p.fight.class {
		t.Fatal("the two players don't share a class")
	}
	h.Tick()
	return h, p, other, c
}

func onDummy(id string, effects ...combat.Effect) combat.Ability {
	return combat.Ability{ID: id, Name: id, Target: "enemy", GCD: new(float64), Range: combat.Distance{Feet: 100}, Effects: effects}
}

func TestTwoCastersKeepTheirOwnCopies(t *testing.T) {
	marked := combat.Condition{Status: "mark", On: "target"}
	h, p, other, c := two(t, []combat.Status{{ID: "mark", Name: "Mark", Duration: 20}},
		onDummy("put", combat.Effect{Type: "status", Affects: "target", Status: "mark"}),
		onDummy("take", combat.Effect{Type: "consume", Affects: "target", Status: "mark"}),
		onDummy("more", combat.Effect{Type: "extend", Affects: "target", Status: "mark", Seconds: 5}),
		combat.Ability{ID: "needs", Name: "needs", Target: "enemy", GCD: new(float64), Range: combat.Distance{Feet: 100}, Requires: []combat.Condition{marked}})
	d := p.layer.dummies[0]
	use(t, p, "put")
	use(t, other, "put")
	pass(h, c, 0.1)
	mineThere, theirs := d.Statuses[statusKey{"mark", p.ID()}], d.Statuses[statusKey{"mark", other.ID()}]
	if mineThere == nil || theirs == nil {
		t.Fatalf("copies = %v", d.Statuses)
	}
	was := theirs.until
	use(t, p, "more")
	pass(h, c, 0.1)
	if theirs.until != was {
		t.Fatal("extending mine moved theirs")
	}
	use(t, p, "take")
	pass(h, c, 0.1)
	if d.Statuses[statusKey{"mark", p.ID()}] != nil || d.Statuses[statusKey{"mark", other.ID()}] == nil {
		t.Fatalf("after taking mine: %v", d.Statuses)
	}
	if got := heard(p, "statusGone"); len(got) != 1 || got[0]["from"] != float64(p.ID()) {
		t.Fatalf("statusGone = %v", got)
	}
	heard(p, "refused")
	use(t, p, "needs")
	if got := heard(p, "refused"); len(got) != 1 {
		t.Fatalf("another caster's copy met my condition: %v", got)
	}
	use(t, other, "needs")
	if got := heard(other, "refused"); len(got) != 0 {
		t.Fatalf("my own copy didn't meet my condition: %v", got)
	}
}

func TestLimitCountsOnlyYourOwnCopies(t *testing.T) {
	h, p, other, c := two(t, []combat.Status{{ID: "mark", Name: "Mark", Duration: 60, Limit: 1}},
		onDummy("put", combat.Effect{Type: "status", Affects: "target", Status: "mark"}))
	d := p.layer.dummies[0]
	use(t, p, "put")
	use(t, other, "put")
	pass(h, c, 0.1)
	if len(d.Statuses) != 2 {
		t.Fatalf("copies = %v", d.Statuses)
	}
}

func TestAGroupHoldsOneStatusWhoeverPutItOn(t *testing.T) {
	h, p, other, c := two(t, []combat.Status{{ID: "aura", Name: "Aura", Group: "aura"}},
		onDummy("put", combat.Effect{Type: "status", Affects: "target", Status: "aura"}))
	d := p.layer.dummies[0]
	use(t, p, "put")
	pass(h, c, 0.1)
	use(t, other, "put")
	pass(h, c, 0.1)
	if len(d.Statuses) != 1 || d.Statuses[statusKey{"aura", other.ID()}] == nil {
		t.Fatalf("copies = %v", d.Statuses)
	}
}

func TestLeavingTakesOffWhatYouPutOn(t *testing.T) {
	h, p, other, c := two(t, []combat.Status{{ID: "mark", Name: "Mark"}},
		onDummy("put", combat.Effect{Type: "status", Affects: "target", Status: "mark"}))
	d := p.layer.dummies[0]
	use(t, p, "put")
	use(t, other, "put")
	pass(h, c, 0.1)
	heard(other, "statusGone")
	p.layer.leave(p)
	if d.Statuses[statusKey{"mark", p.ID()}] != nil || d.Statuses[statusKey{"mark", other.ID()}] == nil {
		t.Fatalf("copies = %v", d.Statuses)
	}
	if got := heard(other, "statusGone"); len(got) != 1 || got[0]["from"] != float64(p.ID()) {
		t.Fatalf("statusGone = %v", got)
	}
}

// A status the swing ends still shows on the swing, so the swing has to be said first.
func TestSwingIsSaidBeforeWhatItEnds(t *testing.T) {
	h, p, c := lifetimes(t, []combat.Status{{ID: "next", Name: "Next", BreaksOn: []string{"action"}}}, selfBuff("next", gaining("next")))
	use(t, p, "next")
	pass(h, c, 0.1)
	heard(p, "statusGone", "swung")
	p.state.At[2] += 12
	if err := p.Handle([]byte(`{"type":"attack","target":-1}`)); err != nil {
		t.Fatal(err)
	}
	pass(h, c, 0.1)
	got := heard(p, "swung", "statusGone")
	if len(got) != 2 || got[0]["type"] != "swung" || got[1]["type"] != "statusGone" {
		t.Fatalf("heard = %v", got)
	}
}
