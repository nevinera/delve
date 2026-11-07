package game

import (
	"encoding/json"
	"fmt"
	"math"
	"testing"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// moving is a fight with a dummy 30 ft ahead of the player and an ability doing this move.
func moving(t *testing.T, e combat.Effect, target string) (*Hub, *Player, *float64) {
	t.Helper()
	h, p, c := fighting(t)
	zero := 0.0
	e.Type = "move"
	if e.Affects == "" {
		e.Affects = "self"
	}
	p.fight.class.Abilities = append(p.fight.class.Abilities, combat.Ability{ID: "shift", Name: "Shift", Target: target, GCD: &zero, Range: combat.Distance{Feet: 1000}, Effects: []combat.Effect{e}})
	d := p.layer.mobs[0]
	d.state.At = [3]float64{p.state.At[0], p.state.At[1], p.state.At[2] + 30}
	p.state.Yaw = 0
	return h, p, c
}

func near(a, b [3]float64) bool {
	return math.Abs(a[0]-b[0]) < 0.01 && math.Abs(a[1]-b[1]) < 0.01 && math.Abs(a[2]-b[2]) < 0.01
}

func TestChargeStopsInMeleeRange(t *testing.T) {
	h, p, c := moving(t, combat.Effect{Kind: "charge", To: "target"}, "any")
	from := p.state.At
	heard(p)
	use(t, p, "shift")
	pass(h, c, 0.05)
	want := [3]float64{from[0], from[1], from[2] + 25}
	if !near(p.state.At, want) {
		t.Fatalf("at %v, want %v", p.state.At, want)
	}
	got := heard(p, "forced")
	if len(got) != 1 || got[0]["kind"] != "charge" || math.Abs(got[0]["seconds"].(float64)-25.0/60) > 0.01 {
		t.Fatalf("forced = %v", got)
	}
}

func TestMoveKinds(t *testing.T) {
	for _, each := range []struct {
		e            combat.Effect
		target       string
		dx, dz       float64
		seconds, arc float64
	}{
		{combat.Effect{Kind: "dash", Distance: 10, Speed: 20}, "self", 0, 10, 0.5, 0},
		{combat.Effect{Kind: "blink", Distance: 12}, "self", 0, 12, 0, 0},
		{combat.Effect{Kind: "leapBack", Distance: 15}, "self", 0, -15, 0.5, 8},
		{combat.Effect{Kind: "knockup", Height: 6}, "self", 0, 0, 0.4, 6},
		{combat.Effect{Kind: "behind", To: "target"}, "enemy", 0, 27, 0, 0},
		{combat.Effect{Kind: "leap", To: "target", Height: 20}, "enemy", 0, 25, 25.0 / 40, 20},
	} {
		t.Run(each.e.Kind, func(t *testing.T) {
			h, p, c := moving(t, each.e, each.target)
			if each.e.Kind == "behind" {
				p.layer.mobs[0].state.Yaw = 0
			}
			from := p.state.At
			heard(p)
			use(t, p, "shift")
			pass(h, c, 0.05)
			if want := [3]float64{from[0] + each.dx, from[1], from[2] + each.dz}; !near(p.state.At, want) {
				t.Fatalf("at %v, want %v", p.state.At, want)
			}
			got := heard(p, "forced")
			if len(got) != 1 || math.Abs(got[0]["seconds"].(float64)-each.seconds) > 0.01 {
				t.Fatalf("forced = %v, want %g s", got, each.seconds)
			}
			if arc, _ := got[0]["height"].(float64); arc != each.arc {
				t.Fatalf("height %g, want %g", arc, each.arc)
			}
		})
	}
}

func TestLeapGoesToTheGroundPoint(t *testing.T) {
	h, p, c := moving(t, combat.Effect{Kind: "leap"}, "ground")
	from := p.state.At
	spot := [3]float64{from[0] + 7, from[1], from[2] + 7}
	b, _ := json.Marshal(spot)
	if err := p.Handle([]byte(fmt.Sprintf(`{"type":"use","ability":"shift","spot":%s}`, b))); err != nil {
		t.Fatal(err)
	}
	pass(h, c, 0.05)
	if !near(p.state.At, spot) {
		t.Fatalf("at %v, want %v", p.state.At, spot)
	}
}

func TestKnockbackAndPullMoveOthers(t *testing.T) {
	zero := 0.0
	shove := combat.Ability{ID: "shove", Name: "Shove", Target: "ally", GCD: &zero, Range: combat.Distance{Feet: 1000}, Effects: []combat.Effect{{Type: "move", Affects: "target", Kind: "knockback", Distance: 10}}}
	yank := combat.Ability{ID: "yank", Name: "Yank", Target: "ally", GCD: &zero, Range: combat.Distance{Feet: 1000}, Effects: []combat.Effect{{Type: "move", Affects: "target", Kind: "pull"}}}
	h, p, other, c := two(t, nil, shove, yank)
	other.state.At = [3]float64{p.state.At[0], p.state.At[1], p.state.At[2] + 20}
	mine := p.state.At
	heard(p)
	heard(other)
	useOn(t, p, "shove", other.ID())
	pass(h, c, 0.05)
	if want := [3]float64{mine[0], mine[1], mine[2] + 30}; !near(other.state.At, want) {
		t.Fatalf("knocked to %v, want %v", other.state.At, want)
	}
	if got := heard(other, "forced"); len(got) != 1 {
		t.Fatalf("they heard %v", got)
	}
	if got := heard(p, "forced"); len(got) != 1 || got[0]["id"] != float64(other.ID()) {
		t.Fatalf("you heard %v", got)
	}
	useOn(t, p, "yank", other.ID())
	pass(h, c, 0.05)
	if want := [3]float64{mine[0], mine[1], mine[2] + 5}; !near(other.state.At, want) {
		t.Fatalf("pulled to %v, want %v", other.state.At, want)
	}
}

func TestMovesLeaveDummiesWhereTheyAre(t *testing.T) {
	h, p, c := moving(t, combat.Effect{Kind: "knockback", Affects: "target"}, "enemy")
	was := p.layer.mobs[0].state.At
	use(t, p, "shift")
	pass(h, c, 0.05)
	if p.layer.mobs[0].state.At != was {
		t.Fatal("the dummy moved")
	}
}

func TestAMoveStopsOtherCasts(t *testing.T) {
	zero := 0.0
	shove := combat.Ability{ID: "shove", Name: "Shove", Target: "ally", GCD: &zero, Range: combat.Distance{Feet: 1000}, Effects: []combat.Effect{{Type: "move", Affects: "target", Kind: "knockback"}}}
	cast := combat.Ability{ID: "slowcast", Name: "Slow", Target: "self", GCD: &zero, CastTime: 2}
	h, p, other, c := two(t, nil, shove, cast)
	use(t, other, "slowcast")
	pass(h, c, 0.1)
	useOn(t, p, "shove", other.ID())
	pass(h, c, 0.05)
	if other.fight.cast != nil {
		t.Fatal("the cast went on")
	}
}

func TestStoppingAt(t *testing.T) {
	wall := groundOf(func(x, z float64) (float64, float64) {
		if x > 10 {
			return 100, math.NaN()
		}
		return 0, math.NaN()
	})
	if got := stoppingAt(wall, [3]float64{0, 0, 0}, [3]float64{20, 0, 0}, false); got[0] != 10 || got[1] != 0 {
		t.Fatalf("walking into a cliff ended at %v", got)
	}
	if got := stoppingAt(wall, [3]float64{0, 0, 0}, [3]float64{20, 0, 0}, true); got[0] != 20 || got[1] != 100 {
		t.Fatalf("flying up a cliff ended at %v", got)
	}
	if got := stoppingAt(wall, [3]float64{15, 100, 0}, [3]float64{5, 100, 0}, false); got[0] != 5 || got[1] != 0 {
		t.Fatalf("going off a cliff ended at %v", got)
	}
	flat := groundOf(func(x, z float64) (float64, float64) { return 0, math.NaN() })
	if got := stoppingAt(flat, [3]float64{5, 0, 0}, [3]float64{-5, 0, 0}, false); got[0] != 0 {
		t.Fatalf("running off the land ended at %v", got)
	}
	if got := stoppingAt(slabbed{}, [3]float64{295, 50, 0}, [3]float64{305, 50, 0}, false); got[0] >= 300 {
		t.Fatalf("went through a wall to %v", got)
	}
	if got := stoppingAt(slabbed{}, [3]float64{90, 50, 0}, [3]float64{150, 50, 0}, false); got[1] != 50 {
		t.Fatalf("under a floor ended at %v", got)
	}
	if got := stoppingAt(slabbed{}, [3]float64{150, 60, 0}, [3]float64{160, 60, 0}, false); got[1] != 60 {
		t.Fatalf("on a floor ended at %v", got)
	}
	water := groundOf(func(x, z float64) (float64, float64) { return 0, 20 })
	if got := stoppingAt(water, [3]float64{0, 15.5, 0}, [3]float64{5, 15.5, 0}, false); got[1] != 15.5 {
		t.Fatalf("in deep water ended at %v", got)
	}
}

// A client's reports don't count while an effect carries it, nor those it sent before it heard, and
// it carries on from where the effect left it.
func TestMovementChecksAllowForAMove(t *testing.T) {
	var m motion
	now := time.Unix(1_800_000_000, 0)
	m = motion{joined: now}
	from := [3]float64{0, 0, 0}
	report := func(at [3]float64, t float64) incoming {
		return incoming{At: at, T: (secondsOf(now) - 100 + t) * 1000, Move: &Move{Forward: 1, Gait: "run"}}
	}
	if v, _ := m.check(report(from, 100), from, now, nil); v != accept {
		t.Fatalf("first report: %v", v)
	}
	end := [3]float64{60, 0, 0}
	m.teleported(now.Add(seconds(1)))
	if v, _ := m.check(report(from, 100.5), end, now.Add(seconds(0.5)), nil); v != ignore {
		t.Fatalf("under way: %v", v)
	}
	for _, at := range []float64{1.1, 1.2, 1.3} {
		if v, _ := m.check(report(from, 100+at), end, now.Add(seconds(at)), nil); v != ignore {
			t.Fatalf("from before it heard, at %g s: %v", at, v)
		}
	}
	if v, why := m.check(report(end, 101.5), end, now.Add(seconds(1.5)), nil); v != accept {
		t.Fatalf("arrived: %v %s", v, why)
	}
	if v, why := m.check(report([3]float64{65, 0, 0}, 101.8), end, now.Add(seconds(1.8)), nil); v != accept {
		t.Fatalf("carrying on: %v %s", v, why)
	}
}
