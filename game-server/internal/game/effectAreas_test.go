package game

import (
	"testing"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// effectAreaFight is a fight with an ability that puts an effect area down, a status to keep, and a dummy at the
// player's feet, 30 ft from nowhere else.
func effectAreaFight(t *testing.T, e combat.Effect) (*Hub, *Player, *float64) {
	t.Helper()
	zero := 0.0
	e.Type = "effectArea"
	if e.Affects == "" {
		e.Affects = "enemies"
	}
	h, p, c := fighting(t)
	p.fight.class.Statuses = append(p.fight.class.Statuses, combat.Status{ID: "inside", Name: "Inside", Kind: "debuff", Duration: 1})
	p.fight.class.Abilities = append(p.fight.class.Abilities, combat.Ability{ID: "lay", Name: "Lay", Target: "self", GCD: &zero, Effects: []combat.Effect{e}})
	d := p.layer.dummies[0]
	d.state.At = p.state.At
	return h, p, c
}

func ouchEvery(n float64) *combat.Effect {
	return &combat.Effect{Type: "damage", Affects: "self", Amount: combat.Amount{Min: n, Max: n}}
}

func TestEffectAreaTicksThenEnds(t *testing.T) {
	h, p, c := effectAreaFight(t, combat.Effect{Radius: 10, Lasts: 3, Every: 1, Effect: ouchEvery(5)})
	d := p.layer.dummies[0]
	was := d.damage
	heard(p)
	use(t, p, "lay")
	pass(h, c, 0.05)
	if got := heard(p, "effectArea"); len(got) != 1 || got[0]["radius"] != 10.0 || got[0]["lasts"] != 3.0 || got[0]["affects"] != "enemies" {
		t.Fatalf("effect area = %v", got)
	}
	pass(h, c, 2.1)
	if got := d.damage - was; got != 10 {
		t.Fatalf("dealt %g in 2 s", got)
	}
	pass(h, c, 3)
	if got := d.damage - was; got > 15 {
		t.Fatalf("dealt %g, more than its 3 ticks", got)
	}
	if len(p.layer.combat.effectAreas) != 0 {
		t.Fatal("it stayed")
	}
	if got := heard(p, "effectAreaGone"); len(got) != 1 {
		t.Fatalf("effectAreaGone = %v", got)
	}
}

func TestEffectAreaKeepsAStatusOnThoseInside(t *testing.T) {
	h, p, c := effectAreaFight(t, combat.Effect{Radius: 10, Lasts: 5, Status: "inside"})
	d := p.layer.dummies[0]
	use(t, p, "lay")
	pass(h, c, 0.1)
	if held(p, "inside") == nil {
		t.Fatal("no status")
	}
	pass(h, c, 2) // past its own 1 s
	if held(p, "inside") == nil {
		t.Fatal("it ran out while still inside")
	}
	d.state.At[0] += 50
	pass(h, c, 0.1)
	if held(p, "inside") != nil {
		t.Fatal("it stayed after leaving")
	}
	d.state.At[0] -= 50
	pass(h, c, 0.1)
	if held(p, "inside") == nil {
		t.Fatal("not back on coming back")
	}
	pass(h, c, 4)
	if held(p, "inside") != nil {
		t.Fatal("it outlasted the effect area")
	}
}

func TestEffectAreaOnEnterLandsOnce(t *testing.T) {
	h, p, c := effectAreaFight(t, combat.Effect{Radius: 10, Lasts: 5, OnEnter: ouchEvery(7)})
	d := p.layer.dummies[0]
	was := d.damage
	use(t, p, "lay")
	pass(h, c, 1)
	if got := d.damage - was; got != 7 {
		t.Fatalf("dealt %g", got)
	}
}

func TestEffectAreaLimitEndsTheOldest(t *testing.T) {
	h, p, c := effectAreaFight(t, combat.Effect{Radius: 10, Lasts: 50, Limit: 2})
	for i := 0; i < 3; i++ {
		use(t, p, "lay")
		pass(h, c, 0.05)
	}
	if got := len(p.layer.combat.effectAreas); got != 2 {
		t.Fatalf("%d out", got)
	}
}

func TestEffectAreaCopiesOnlyStackIfTheyOverlap(t *testing.T) {
	for _, overlaps := range []bool{false, true} {
		h, p, c := effectAreaFight(t, combat.Effect{Radius: 10, Lasts: 50, Every: 1, Effect: ouchEvery(5), Overlaps: overlaps})
		d := p.layer.dummies[0]
		use(t, p, "lay")
		pass(h, c, 0.05)
		use(t, p, "lay")
		pass(h, c, 0.05)
		was := d.damage
		pass(h, c, 1.2)
		want := 5.0
		if overlaps {
			want = 10
		}
		if got := d.damage - was; got != want {
			t.Fatalf("overlaps %v: dealt %g, want %g", overlaps, got, want)
		}
	}
}

func TestLineOnlyCoversItsStrip(t *testing.T) {
	h, p, c := effectAreaFight(t, combat.Effect{Radius: 30, Width: 4, Line: true, Lasts: 50, Status: "inside"})
	d := p.layer.dummies[0]
	p.state.Yaw = 0
	start := p.state.At
	use(t, p, "lay")
	pass(h, c, 0.05)
	for _, each := range []struct {
		dx, dz float64
		want   bool
	}{{0, 20, true}, {1.5, 20, true}, {3, 20, false}, {0, 31, false}, {0, -5, false}} {
		d.state.At = [3]float64{start[0] + each.dx, start[1], start[2] + each.dz}
		pass(h, c, 0.1)
		if got := held(p, "inside") != nil; got != each.want {
			t.Fatalf("at %g, %g: inside = %v", each.dx, each.dz, got)
		}
	}
}

func TestLeavingEndsYourEffectAreas(t *testing.T) {
	h, p, c := effectAreaFight(t, combat.Effect{Radius: 10, Lasts: 50})
	use(t, p, "lay")
	pass(h, c, 0.05)
	layer := p.layer
	layer.mu.Lock()
	delete(layer.players, p.ID())
	layer.mu.Unlock()
	pass(h, c, 0.1)
	if len(layer.combat.effectAreas) != 0 {
		t.Fatal("it stayed")
	}
}

func TestAuraKeepsAStatusOnThoseNear(t *testing.T) {
	zero := 0.0
	glow := combat.Status{ID: "glow", Name: "Glow", Kind: "buff", Duration: 5, Effects: []combat.StatusEffect{{Type: "aura", Radius: 30, Affects: "allies", Status: "warm"}}}
	warm := combat.Status{ID: "warm", Name: "Warm", Kind: "buff"}
	h, p, other, c := two(t, []combat.Status{glow, warm}, combat.Ability{ID: "shine", Name: "Shine", Target: "self", GCD: &zero, Effects: []combat.Effect{{Type: "status", Affects: "self", Status: "glow"}}})
	key := statusKey{"warm", p.ID()}
	use(t, p, "shine")
	other.state.At = p.state.At
	pass(h, c, 0.1)
	if p.fight.unit.Statuses[key] == nil || other.fight.unit.Statuses[key] == nil {
		t.Fatal("it didn't reach them both")
	}
	other.state.At[0] += 40
	pass(h, c, 0.1)
	if other.fight.unit.Statuses[key] != nil {
		t.Fatal("it stayed on someone who left")
	}
	if p.fight.unit.Statuses[key] == nil {
		t.Fatal("the holder lost it")
	}
	other.state.At = p.state.At
	pass(h, c, 0.1)
	pass(h, c, 5)
	if p.fight.unit.Statuses[key] != nil || other.fight.unit.Statuses[key] != nil {
		t.Fatal("it outlasted the aura")
	}
}

func TestAuraEffectLandsEachEvery(t *testing.T) {
	zero := 0.0
	glow := combat.Status{ID: "burns", Name: "Burns", Kind: "buff", Effects: []combat.StatusEffect{{Type: "aura", Radius: 30, Affects: "enemies", Every: 1, Effect: ouchEvery(3)}}}
	h, p, _, c := two(t, []combat.Status{glow}, combat.Ability{ID: "flare", Name: "Flare", Target: "self", GCD: &zero, Effects: []combat.Effect{{Type: "status", Affects: "self", Status: "burns"}}})
	d := p.layer.dummies[0]
	d.state.At = p.state.At
	was := d.damage
	use(t, p, "flare")
	pass(h, c, 2.2)
	if got := d.damage - was; got != 6 {
		t.Fatalf("dealt %g", got)
	}
}
