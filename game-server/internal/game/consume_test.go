package game

import (
	"testing"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// consuming is a fight where the player has abilities to put a status on the dummy and work on it.
func consuming(t *testing.T, status combat.Status, abilities ...combat.Ability) (*Hub, *Player, *float64) {
	t.Helper()
	h, p, c := fighting(t)
	p.fight.class.Statuses = append(p.fight.class.Statuses, status)
	zero := 0.0
	p.fight.class.Abilities = append(p.fight.class.Abilities, combat.Ability{
		ID: "put", Name: "Put", Target: "enemy", GCD: &zero, Range: combat.Distance{Feet: 100},
		Effects: []combat.Effect{{Type: "status", Affects: "target", Status: status.ID}},
	})
	for _, a := range abilities {
		a.Target, a.GCD, a.Range = "enemy", &zero, combat.Distance{Feet: 100}
		p.fight.class.Abilities = append(p.fight.class.Abilities, a)
	}
	return h, p, c
}

func withEffects(id string, effects ...combat.Effect) combat.Ability {
	return combat.Ability{ID: id, Name: id, Effects: effects}
}

func held(p *Player, id string) *activeStatus {
	return p.layer.dummies[0].Statuses[statusKey{id, p.ID()}]
}

func TestConsumeTakesAStatusOff(t *testing.T) {
	h, p, c := consuming(t, combat.Status{ID: "mark", Name: "Mark", Duration: 20},
		withEffects("take", combat.Effect{Type: "consume", Affects: "target", Statuses: []string{"mark"}}))
	use(t, p, "put")
	pass(h, c, 0.1)
	if held(p, "mark") == nil {
		t.Fatal("the status never landed")
	}
	use(t, p, "take")
	pass(h, c, 0.1)
	if held(p, "mark") != nil {
		t.Fatal("the status stayed on")
	}
	if got := heard(p, "statusGone"); len(got) != 1 || got[0]["status"] != "mark" {
		t.Fatalf("statusGone = %v", got)
	}
}

func TestConsumeTakesStacksAndSeconds(t *testing.T) {
	h, p, c := consuming(t, combat.Status{ID: "mark", Name: "Mark", Duration: 20},
		withEffects("stack", combat.Effect{Type: "consume", Affects: "target", Status: "mark", Stacks: 2}),
		withEffects("time", combat.Effect{Type: "consume", Affects: "target", Status: "mark", Seconds: 5}))
	use(t, p, "put")
	pass(h, c, 0.1)
	held(p, "mark").stacks = 3
	use(t, p, "stack")
	pass(h, c, 0.1)
	if got := held(p, "mark"); got == nil || got.stacks != 1 {
		t.Fatalf("after taking 2 of 3 stacks: %+v", got)
	}
	before := held(p, "mark").until
	use(t, p, "time")
	pass(h, c, 0.1)
	if got := before.Sub(held(p, "mark").until).Seconds(); got != 5 {
		t.Fatalf("took %g s, want 5", got)
	}
	if got := heard(p, "statusChanged"); len(got) != 2 || got[0]["stacks"] != 1.0 {
		t.Fatalf("statusChanged = %v", got)
	}
}

func TestConsumeDealsWhatWasLeft(t *testing.T) {
	bleed := combat.Status{ID: "bleed", Name: "Bleed", Duration: 12, Effects: []combat.StatusEffect{
		{Type: "periodic", Every: 2, Does: "damage", Amount: combat.Amount{Min: 10, Max: 10}},
	}}
	for _, keeps := range []bool{false, true} {
		h, p, c := consuming(t, bleed, withEffects("dry", combat.Effect{Type: "consume", Affects: "target", Status: "bleed", DealsLeft: 0.5, Keeps: keeps}))
		use(t, p, "put")
		pass(h, c, 0.1)
		health := p.layer.dummies[0].damage
		use(t, p, "dry")
		pass(h, c, 0.1)
		// It has all 6 of its ticks to come, 10 each, and half of that is 30.
		if got := p.layer.dummies[0].damage - health; got != 30 {
			t.Fatalf("keeps %v: dealt %g, want 30", keeps, got)
		}
		if (held(p, "bleed") != nil) != keeps {
			t.Fatalf("keeps %v: status is %+v", keeps, held(p, "bleed"))
		}
	}
}

func TestConsumeDoesSomethingPerStack(t *testing.T) {
	per := combat.Effect{Type: "damage", Affects: "target", Amount: combat.Amount{Min: 7, Max: 7}}
	h, p, c := consuming(t, combat.Status{ID: "mark", Name: "Mark", Duration: 20},
		withEffects("burst", combat.Effect{Type: "consume", Affects: "target", Status: "mark", PerStack: &per}))
	h.roll = func() float64 { return 0.5 }
	use(t, p, "put")
	pass(h, c, 0.1)
	held(p, "mark").stacks = 3
	health := p.layer.dummies[0].damage
	use(t, p, "burst")
	pass(h, c, 0.1)
	if got := p.layer.dummies[0].damage - health; got != 21 {
		t.Fatalf("dealt %g, want 21", got)
	}
}

func TestExtend(t *testing.T) {
	h, p, c := consuming(t, combat.Status{ID: "mark", Name: "Mark", Duration: 20},
		withEffects("more", combat.Effect{Type: "extend", Affects: "target", Status: "mark", Seconds: 4}),
		withEffects("capped", combat.Effect{Type: "extend", Affects: "target", Status: "mark", Seconds: 100, MaxShare: 1.3}),
		withEffects("over", combat.Effect{Type: "extend", Affects: "target", Status: "mark", Refresh: true}),
		withEffects("spent", combat.Effect{Type: "extend", Affects: "target", Status: "mark", PerSpent: 2}),
		withEffects("onto", combat.Effect{Type: "extend", Affects: "target", Status: "mark", Seconds: 4, Apply: true}),
		withEffects("miss", combat.Effect{Type: "extend", Affects: "target", Status: "mark", Seconds: 4}))
	use(t, p, "miss")
	pass(h, c, 0.1)
	if held(p, "mark") != nil {
		t.Fatal("extend put on a status without apply")
	}
	use(t, p, "onto")
	pass(h, c, 0.1)
	if held(p, "mark") == nil {
		t.Fatal("apply didn't put it on")
	}
	left := func() float64 { return held(p, "mark").until.Sub(h.now()).Seconds() }
	was := left()
	use(t, p, "more")
	pass(h, c, 0.05)
	if got := left() - was; got < 3.9 || got > 4 {
		t.Fatalf("extended by %g, want about 4", got)
	}
	use(t, p, "capped")
	pass(h, c, 0.05)
	if got := left(); got < 25.8 || got > 26 {
		t.Fatalf("capped at %g, want about 26", got)
	}
	use(t, p, "over")
	pass(h, c, 0.05)
	if got := left(); got < 19.8 || got > 20 {
		t.Fatalf("refreshed to %g, want about 20", got)
	}
	p.fight.class.Resources = append(p.fight.class.Resources, combat.Resource{Key: "rage", Max: 100})
	p.fight.resources["rage"] = 10
	for i := range p.fight.class.Abilities {
		if a := &p.fight.class.Abilities[i]; a.ID == "spent" {
			a.Cost = []combat.Cost{{Resource: "rage", Amount: 3}}
		}
	}
	was = left()
	use(t, p, "spent")
	pass(h, c, 0.05)
	if got := left() - was; got < 5.9 || got > 6 {
		t.Fatalf("3 points at 2 s each extended by %g, want about 6", got)
	}
	if got := heard(p, "statusChanged"); len(got) != 4 {
		t.Fatalf("statusChanged = %v", got)
	}
}

// An oath's button swears it, then ends it, and the count goes up and back down.
func TestOathButtonSwearsAndEnds(t *testing.T) {
	h, p, c := fighting(t)
	p.fight.class.Resources = append(p.fight.class.Resources, combat.Resource{Key: "oath", Max: 3})
	have := combat.Condition{Status: "oath", On: "self"}
	notHave := combat.Condition{Not: &have}
	zero := 0.0
	conditional(p, combat.Ability{ID: "swear", Name: "Swear", Target: "self", GCD: &zero, Effects: []combat.Effect{
		{Type: "resource", Affects: "self", Resource: "oath", Amount: combat.Amount{Min: 1, Max: 1}, When: []combat.Condition{notHave}},
		{Type: "status", Affects: "self", Status: "oath", When: []combat.Condition{notHave}},
		{Type: "resource", Affects: "self", Resource: "oath", Amount: combat.Amount{Min: -1, Max: -1}, When: []combat.Condition{have}},
		{Type: "consume", Affects: "self", Statuses: []string{"oath"}, When: []combat.Condition{have}},
	}})
	use(t, p, "swear")
	pass(h, c, 0.1)
	if p.fight.unit.Statuses[statusKey{"oath", p.ID()}] == nil || p.fight.resources["oath"] != 1 {
		t.Fatalf("after swearing: status %v, oath %g", p.fight.unit.Statuses[statusKey{"oath", p.ID()}], p.fight.resources["oath"])
	}
	use(t, p, "swear")
	pass(h, c, 0.1)
	if p.fight.unit.Statuses[statusKey{"oath", p.ID()}] != nil || p.fight.resources["oath"] != 0 {
		t.Fatalf("after ending: status %v, oath %g", p.fight.unit.Statuses[statusKey{"oath", p.ID()}], p.fight.resources["oath"])
	}
}
